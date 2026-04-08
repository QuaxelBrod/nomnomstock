"use client"

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
      const swPath = `${base}/sw.js`
      const scope = base ? `${base}/` : '/'
      navigator.serviceWorker.register(swPath, { scope }).catch((e) => {
        // ignore registration errors in dev
        console.warn('SW registration failed', e)
      })
    }
  }, [])

  return null
}
