declare var self: ServiceWorkerGlobalScopeExtended

import parseFetchEvent from './service-worker/parse-fetch-event'
import getPeristedStorage from './service-worker/storage'
import { serviceWorkerDebug } from './service-worker/utils/log'

self.localForge = getPeristedStorage()

self.addEventListener('install', event => {
  serviceWorkerDebug('Installed')
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  serviceWorkerDebug('Activated')
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  event.respondWith(parseFetchEvent(event))
})
