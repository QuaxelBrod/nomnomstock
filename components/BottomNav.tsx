"use client"

import Link from 'next/link'
import { useSession } from 'next-auth/react'


export default function BottomNav() {
  const { data: session } = useSession()
  return (
    <nav className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur rounded-xl shadow-md px-4 py-2 flex gap-3 items-center overflow-x-auto">
      <Link href="/lager" className="text-sm font-medium text-gray-700">Vorrat</Link>
      <Link href="/scan" className="text-sm font-medium text-gray-700">Scan</Link>
      <Link href="/einkauf" className="text-sm font-medium text-gray-700">Einkauf</Link>
      <Link href="/profil" className="text-sm font-medium text-gray-700">Profil</Link>
      {!session && (
        <Link href="/auth/login" className="ml-2 text-sm text-blue-600">Login</Link>
      )}
    </nav>
  )
}
