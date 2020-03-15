declare var self: ServiceWorkerGlobalScope
export {}

import { TranspileOptions } from 'typescript'
import { MyServerMessageEvents } from './message-events'
import compileTypescript from './typescript/compiler'

let cachedTsConfig: TranspileOptions | undefined
let cachedSourcePath: string | undefined
let compiledFileCacheName: string | undefined

const fileTypePatterns = {
  typescript: /\.tsx?.js$/
}

async function parseFetchEvent(event: FetchEvent): Promise<Response> {
  // const url = .test(event.request.url) ? event.request.url : `${event.request.url}.ts`;

  debugger
  if (fileTypePatterns.typescript.test(event.request.url)) {
    const result = await compileTypescript(event.request, cachedTsConfig!)

    debugger
    console.log(result.outputText)

    let responseToCache = new Response(
      new Blob([result.outputText], {
        type: 'application/javascript'
      }),
      {
        status: 200
      }
    )

    const cache = await caches.open(compiledFileCacheName!)
    cache.put(event.request, responseToCache.clone())

    return responseToCache
  }

  return fetch(event.request)
}

self.addEventListener('message', async (event: MyServerMessageEvents) => {
  if (!event.data) return

  if (event.data.type === 'LOAD_TSCONFIG') {
    cachedTsConfig = event.data.tsConfig
    cachedSourcePath = event.data.src
    compiledFileCacheName = event.data.cacheName

    event.ports[0].postMessage({ type: 'TSCONFIG_LOADED' })
  }
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return

  console.log('got request', event.request.url, event.request)
  console.log({ cachedSourcePath, cachedTsConfig })

  if (cachedSourcePath && event.request.url.indexOf(cachedSourcePath) === 0) {
    console.log('parsing request')
    event.respondWith(parseFetchEvent(event))
  }
})
