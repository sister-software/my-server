/// <reference lib="dom" />

import { MyServerInitOptions, createDefaultInitOptions } from './server/init-options'
import { clientDebug } from './server/utils/log'

class MyServer {
  initOptions: MyServerInitOptions
  messageChannel = new MessageChannel()
  serviceWorker: ServiceWorker | null = null

  constructor(options: Partial<MyServerInitOptions>) {
    this.initOptions = {
      ...createDefaultInitOptions(),
      ...options
    }

    navigator.serviceWorker.addEventListener('controllerchange', this.handleServiceWorkerChange)
  }

  get scriptPathPrefix() {
    return `${location.protocol}//${location.host}`
  }

  appendEntryScript = () => {
    const { scope, entry } = this.initOptions

    const entryScript = document.createElement('script')
    entryScript.type = 'module'
    entryScript.src = `${this.scriptPathPrefix}${scope}${entry}`

    clientDebug('Appending entry script', entryScript)
    document.body.appendChild(entryScript)
  }

  handleServiceWorkerChange = () => {
    this.serviceWorker = navigator.serviceWorker.controller

    this.appendEntryScript()
    clientDebug('service worker changed', this.serviceWorker)
  }

  async register(): Promise<ServiceWorkerRegistration> {
    const existingRegistration = await navigator.serviceWorker.getRegistration()

    if (existingRegistration) {
      // console.log('already registered!', existingRegistration.active)
      this.serviceWorker = existingRegistration.active
      // console.log('waiting...')
      await navigator.serviceWorker.ready

      this.handleServiceWorkerChange()
      return existingRegistration
    }

    const { workerBridgePath } = this.initOptions

    // const workerBridge = new Blob([`self.importScripts('http://localhost:8888/service-worker.js')`], {
    //   type: 'application/javascript'
    // })

    const serviceWorkerRegistration = await navigator.serviceWorker.register(workerBridgePath, {
      scope: this.initOptions.scope
    })

    console.log('waiting...', serviceWorkerRegistration)
    await navigator.serviceWorker.ready
    // console.log('registered!', serviceWorkerRegistration.active)

    return serviceWorkerRegistration
  }
}

declare global {
  interface Window {
    MyServer: typeof MyServer
  }
}

window.MyServer = MyServer
