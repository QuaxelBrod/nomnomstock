"use client"

import { useEffect } from 'react'

export default function CenteredCheck({ visible, onHidden }: { visible: boolean, onHidden?: () => void }) {
  useEffect(() => {
    if (!visible) return
    const id = setTimeout(() => onHidden && onHidden(), 1000)
    return () => clearTimeout(id)
  }, [visible, onHidden])

  if (!visible) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
      <div className="flex items-center justify-center">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
    </div>
  )
}
