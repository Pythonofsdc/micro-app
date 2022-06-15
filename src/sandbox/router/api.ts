import type {
  Func,
  Router,
  RouterTarget,
  navigationMethod,
  MicroLocation,
  RouterGuard,
  GuardLocation,
  AccurateGuard,
  GlobalNormalGuard,
} from '@micro-app/types'
import {
  encodeMicroPath,
  decodeMicroPath,
} from './core'
import {
  logError,
  formatAppName,
  createURL,
  isFunction,
  isPlainObject,
  useCallbacks,
  requestIdleCallback,
} from '../../libs/utils'
import { appInstanceMap } from '../../create_app'
import { getActiveApps } from '../../micro_app'
import { dispatchPopStateEventToMicroApp } from './event'
import globalEnv from '../../libs/global_env'

export interface RouterApi {
  router: Router,
  executeNavigationGuard: (appName: string, to: GuardLocation, from: GuardLocation) => void
}

function createRouterApi (): RouterApi {
  /**
   * path需要注意的是两点：1、子应用的base也要加上 2、对于hash路由，要带上hash，如果开发者不知道具体地址如何写，那么单独运行子应用，跳转到对应的页面，复制浏览器地址
   * path 为子应用除域名外的全量地址(可以带上域名)
   * 相同的地址是否需要继续跳转？？？
   */
  function createNavigationMethod (replace: boolean): navigationMethod {
    return function (to: RouterTarget): void {
      if (typeof to?.name === 'string' && typeof to.path === 'string') {
        const app = appInstanceMap.get(to.name = formatAppName(to.name))
        if (!app) return logError(`navigation failed, the app named ${to.name} not exist`)
        if (!app.sandBox) return logError(`navigation failed, the sandBox of app ${to.name} is closed`)
        if (!getActiveApps().includes(to.name)) return logError(`navigation failed, the app named ${to.name} has been unmounted`)
        const proxyWindow = app.sandBox.proxyWindow
        const microLocation = proxyWindow.location
        const currentFullPath = microLocation.pathname + microLocation.search + microLocation.hash
        const targetLocation = createURL(to.path, app.url)
        // Only get path data, even if the origin is different from microApp
        const targetPath = targetLocation.pathname + targetLocation.search + targetLocation.hash
        if (currentFullPath !== targetPath) {
          proxyWindow.history[replace || to.replace ? 'replaceState' : 'pushState'](to.state ?? null, '', targetPath)
          dispatchPopStateEventToMicroApp(to.name, proxyWindow, null)
        }
      } else {
        logError('navigation failed, name & path are required')
      }
    }
  }

  // create method of history.go/back/forward
  function createRawHistoryMethod (methodName: string): Func {
    return function (...rests: unknown[]): void {
      return globalEnv.rawWindow.history[methodName](...rests)
    }
  }

  const beforeGuards = useCallbacks<RouterGuard>()
  const afterGuards = useCallbacks<RouterGuard>()

  /**
   * run all of beforeEach/afterEach guards
   * @param appName app name
   * @param to target location
   * @param from old location
   * @param guards guards list
   */
  function runGuards (
    appName: string,
    to: GuardLocation,
    from: GuardLocation,
    guards: Set<RouterGuard>,
  ) {
    for (const guard of guards) {
      if (isFunction(guard)) {
        (guard as GlobalNormalGuard)(appName, to, from)
      } else if (isPlainObject(guard) && isFunction((guard as AccurateGuard)[appName])) {
        (guard as AccurateGuard)[appName](to, from)
      }
    }
  }

  /**
   * global hook for router
   * update router information base on microLocation
   * @param appName app name
   * @param microLocation location of microApp
   */
  function executeNavigationGuard (
    appName: string,
    to: GuardLocation,
    from: GuardLocation,
  ): void {
    router.current.set(appName, to)

    runGuards(appName, to, from, beforeGuards.list())

    requestIdleCallback(() => {
      runGuards(appName, to, from, afterGuards.list())
    })
  }

  // Router API for developer
  const router: Router = {
    current: new Map<string, MicroLocation>(),
    encode: encodeMicroPath,
    decode: decodeMicroPath,
    push: createNavigationMethod(false),
    replace: createNavigationMethod(true),
    go: createRawHistoryMethod('go'),
    back: createRawHistoryMethod('back'),
    forward: createRawHistoryMethod('forward'),
    beforeEach: beforeGuards.add,
    afterEach: afterGuards.add,
  }

  return { router, executeNavigationGuard }
}

export const { router, executeNavigationGuard } = createRouterApi()