"use client"

import { SessionProvider } from 'next-auth/react'
import React from 'react'
import ThemeProvider from './ThemeProvider'
import ServiceWorkerRegister from './ServiceWorkerRegister'

export default function Providers({ children, authBasePath }: { children: React.ReactNode; authBasePath?: string }) {
  return (
    <SessionProvider basePath={authBasePath || '/api/auth'}>
      <ThemeProvider>
        {children}
        <ServiceWorkerRegister />
      </ThemeProvider>
    </SessionProvider>
  )
}
