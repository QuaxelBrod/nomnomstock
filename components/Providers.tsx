"use client"

import { SessionProvider } from 'next-auth/react'
import React from 'react'
import ThemeProvider from './ThemeProvider'
import ServiceWorkerRegister from './ServiceWorkerRegister'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        <ServiceWorkerRegister />
      </ThemeProvider>
    </SessionProvider>
  )
}
