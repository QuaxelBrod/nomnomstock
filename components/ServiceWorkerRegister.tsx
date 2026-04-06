"use client"

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e) => {
        // ignore registration errors in dev
        console.warn('SW registration failed', e)
      })
    }
  }, [])

  return null
}
