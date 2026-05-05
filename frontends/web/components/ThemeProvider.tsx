"use client"

import React, { useEffect, useState } from 'react'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('theme') : null
    // Default to dark mode unless the user explicitly chose otherwise
    const theme = stored || 'dark'
    if (theme === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    setReady(true)
  }, [])

  return <>{ready ? children : null}</>
}
