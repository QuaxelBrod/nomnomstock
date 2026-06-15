"use client"

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'


export default function BottomNav() {
  const { data: session } = useSession()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-black/70 backdrop-blur border-t border-gray-200 dark:border-gray-800 px-3 py-3">
      <div className="max-w-3xl mx-auto flex items-center gap-2 sm:gap-4">
        <Link href="/lager" className="flex-1 text-center text-sm sm:text-base font-medium text-gray-700 dark:text-gray-200">Vorrat</Link>
        <Link href="/scan" className="flex-1 text-center text-sm sm:text-base font-medium text-gray-700 dark:text-gray-200">Scan</Link>
        <Link href="/einkauf" className="flex-1 text-center text-sm sm:text-base font-medium text-gray-700 dark:text-gray-200">Einkauf</Link>
        <Link href="/angebote" className="flex-1 text-center text-sm sm:text-base font-medium text-gray-700 dark:text-gray-200">Angebote</Link>
        <Link href="/rezepte" className="flex-1 text-center text-sm sm:text-base font-medium text-gray-700 dark:text-gray-200">Rezepte</Link>
        <Link href="/profil" className="flex-1 text-center text-sm sm:text-base font-medium text-gray-700 dark:text-gray-200">Profil</Link>
        <div className="flex items-center gap-2">
          {!session && (
            <Link href="/auth/login" className="text-sm text-blue-600">Login</Link>
          )}
        </div>
      </div>
    </nav>
  )
}
