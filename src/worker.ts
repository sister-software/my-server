declare var self: ServiceWorkerGlobalScope
export {}

import compileTypescript, { getTSConfig } from './typescript/compiler'
import getPeristedStorage from './worker/storage'

const storage = getPeristedStorage()

const fileTypePatterns = {
  typescript: /\.tsx?$/,
  scss: /\.scss|sass$/
}

const skipCompile = '?skip-compile'

const log = console.log.bind(console, 'WORKER:')

async function parseFetchEvent({ request }: FetchEvent): Promise<Response> {
  log(request.url, request)
  if (request.method !== 'GET') {
    return fetch(request)
  }

  if (fileTypePatterns.typescript.test(request.url) && request.url.indexOf(skipCompile) === -1) {
    const tsConfig = await getTSConfig(storage)
    const { compiledResult, diagnostics } = await compileTypescript(request, tsConfig)

    if (compiledResult) {
      return new Response(
        new Blob([compiledResult], {
          type: 'application/javascript'
        }),
        {
          status: 200
        }
      )
    } else if (diagnostics) {
      const diagnosticsContent = diagnostics.join('\n')

      console.error(diagnosticsContent)

      return new Response(
        new Blob([diagnosticsContent], {
          type: 'application/javascript'
        }),
        {
          status: 200
        }
      )
    }

    // const cache = await caches.open(compiledFileCacheName!)
    // cache.put(request, responseToCache.clone())
  }

  return fetch(request)
}

self.addEventListener('install', event => {
  console.log('installed!')
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  console.log('activate!')
  event.waitUntil(self.clients.claim())
})

// self.addEventListener('message', async (event: MyServerMessageEvents) => {
//   if (!event.data) return

//   if (event.data.type === 'LOAD_TSCONFIG') {
//     storage.setItem('tsConfig', event.data.tsConfig)
//     storage.setItem('sourcePath', event.data.src)
//     storage.setItem('cacheName', event.data.cacheName)

//     event.ports[0].postMessage({ type: 'TSCONFIG_LOADED' })
//   }
// })

self.addEventListener('fetch', event => {
  event.respondWith(parseFetchEvent(event))
})
