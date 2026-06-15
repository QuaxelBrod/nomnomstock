"use client"

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
      const swPath = `${base}/sw.js`
      const scope = base ? `${base}/` : '/'
      navigator.serviceWorker.register(swPath, { scope }).then((registration) => {
        registration.update().catch(() => undefined)
      }).catch((e) => {
        // ignore registration errors in dev
        console.warn('SW registration failed', e)
      })

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        try {
          if (sessionStorage.getItem('nomnom-sw-reloaded') === '1') return
          sessionStorage.setItem('nomnom-sw-reloaded', '1')
          window.location.reload()
        } catch {
          window.location.reload()
        }
      })
    }
  }, [])

  return null
}
