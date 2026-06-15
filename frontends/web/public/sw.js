const CACHE_NAME = 'nomnom-static-v8'
const BASE_PATH = '/nomnomstock'
const APP_SHELL = `${BASE_PATH}/auth/login/`
const ASSETS = [
  APP_SHELL,
  `${BASE_PATH}/einkauf/`,
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/icons/icon.svg`
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS.map((asset) => cache.add(asset)))
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('nomnom-static-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Keep browser extension and cross-origin requests untouched.
  if (url.origin !== self.location.origin) return
  if (request.method !== 'GET') return

  // Let Next.js hashed build assets use the browser/http cache directly.
  // Intercepting them cache-first can strand old PWAs after a deployment.
  if (url.pathname.includes('/_next/static/')) return

  // Navigations: network first, app-shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME)
        return (await cache.match(request)) || (await cache.match(APP_SHELL))
      })
    )
    return
  }

  // Network first for API calls, cache-first for others
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME)
        return cache.match(request)
      })
    )
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      try {
        const response = await fetch(request)
        cache.put(request, response.clone())
        return response
      } catch {
        return new Response('offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
    })
  )
})
