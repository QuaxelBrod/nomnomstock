const CACHE_NAME = 'nomnom-static-v3'
const BASE_PATH = '/nomnomstock'
const ASSETS = [
  BASE_PATH,
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/icons/icon.svg`
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Network first for API calls, cache-first for others
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    )
    return
  }

  event.respondWith(
    caches.match(request).then((resp) => resp || fetch(request))
  )
})
