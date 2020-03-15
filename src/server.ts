/// <reference lib="dom" />

import { TsConfigSourceFile } from 'typescript'
import { MyServerLoadTSConfigEvent } from './message-events'

export interface MyServerInitOptions {
  /** Path to your app's source files. */
  src: string
  /** Path to where your app initializes. */
  entry: 'main.ts'
  /** Scope limiting which files in your source directory should be compiled. */
  scope: '/'
  tsConfig: TsConfigSourceFile
  workerPath: string
  /** Name of cache used in Service Worker */
  cacheName: string
}

class MyServer {
  initOptions: MyServerInitOptions
  messageChannel = new MessageChannel()
  serviceWorker: ServiceWorker | null = null

  constructor(options: MyServerInitOptions) {
    this.initOptions = options

    this.messageChannel.port1.addEventListener('message', this.handleMessagePort1)
    // this.messageChannel.port2.addEventListener('message', this.handleMessagePort2)
  }

  get scriptPathPrefix() {
    return `${location.protocol}//${location.host}`
  }

  appendEntryScript() {
    const { src, entry } = this.initOptions

    const entryScript = document.body.appendChild(document.createElement('script'))
    entryScript.type = 'module'
    entryScript.src = `${this.scriptPathPrefix}${src}${entry}`
  }

  // handleMessagePort1(event: MessageEvent) {
  //   if (event.data) return

  //   switch (event.data.type) {
  //   }
  // }

  handleMessagePort1 = (event: MessageEvent) => {
    console.log('port 1', event)
    if (event.data) return

    switch (event.data.type) {
      case 'TSCONFIG_LOADED':
        this.appendEntryScript()
        break
    }
  }

  handleServiceWorkerChange(serviceWorker: ServiceWorker) {
    this.serviceWorker = serviceWorker

    if (this.serviceWorker) {
      const { src, tsConfig } = this.initOptions

      const message: MyServerLoadTSConfigEvent['data'] = {
        type: 'LOAD_TSCONFIG',
        src: `${this.scriptPathPrefix}${src}`,
        cacheName: 'MyServerCompiledFileCache',
        tsConfig
      }

      debugger
      this.serviceWorker.postMessage(message, [this.messageChannel.port2])
    }
  }

  async register() {
    const { workerPath } = this.initOptions
    const serviceWorkerRegistration = await navigator.serviceWorker.register(workerPath, {
      scope: this.initOptions.scope || '/'
    })

    if (serviceWorkerRegistration.active && serviceWorkerRegistration.active.state === 'activated') {
      this.handleServiceWorkerChange(serviceWorkerRegistration.active)
    } else {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this.serviceWorker = navigator.serviceWorker.controller
      })
    }
    // this.messageChannel.port1.onmessage = this.handleMessagePort1
  }
}

declare global {
  interface Window {
    MyServer: typeof MyServer
  }
}

window.MyServer = MyServer
