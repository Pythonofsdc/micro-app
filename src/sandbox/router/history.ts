import type {
  MicroState,
  MicroLocation,
  MicroHistory,
  HistoryProxyValue,
} from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import { isString, logError, createURL } from '../../libs/utils'
import { updateLocation } from './location'
import { setMicroPathToURL, setMicroState, getMicroState } from './core'

// history of micro app
export function createMicroHistory (
  appName: string,
  base: string,
  microLocation: MicroLocation,
): MicroHistory {
  const rawHistory = globalEnv.rawWindow.history
  function getMicroHistoryMethod (methodName: PropertyKey): CallableFunction {
    return (...rests: any[]) => {
      // console.log(444444444, rests[0], rests[1], rests[2], methodName)
      let targetPath = null
      // 对pushState/replaceState的state和path进行格式化，这里最关键的一步！！
      if ((methodName === 'pushState' || methodName === 'replaceState') && rests[2] && isString(rests[2])) {
        try {
          const targetLocation = createURL(rests[2], base)
          if (targetLocation.origin === microLocation.origin) {
            targetPath = targetLocation.pathname + targetLocation.search + targetLocation.hash
            const setMicroPathResult = setMicroPathToURL(appName, targetLocation)
            rests = [
              setMicroState(appName, rawHistory.state, rests[0], base, setMicroPathResult.searchHash),
              rests[1],
              setMicroPathResult.fullPath,
            ]
          }
        } catch (e) {
          logError(e, appName)
        }
      }

      rawHistory[methodName].apply(rawHistory, rests)

      if (targetPath) updateLocation(appName, targetPath, base, microLocation)

      // console.log(5555555, microLocation, base)
    }
  }

  return new Proxy(rawHistory, {
    get (target: History, key: PropertyKey): HistoryProxyValue {
      if (key === 'state') {
        return getMicroState(appName, rawHistory.state)
      } else if (typeof Reflect.get(target, key) === 'function') {
        return getMicroHistoryMethod(key)
      }
      return Reflect.get(target, key)
    },
    set (target: History, key: PropertyKey, value: unknown): boolean {
      return Reflect.set(target, key, value)
    }
  })
}

// update browser url when child app mount/unmount
export function updateBrowserURL (state: MicroState, fullPath: string): void {
  globalEnv.rawWindow.history.replaceState(state, null, fullPath)
}