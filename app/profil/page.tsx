"use client"

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useEffect, useState, useRef } from 'react'

export default function ProfilPage() {
  const { data: session } = useSession()
  const [name, setName] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''

  useEffect(() => {
    if (!session?.user?.email) return
    setName(session.user?.name || '')
    // fetch stored profile from server
    ;(async () => {
      try {
        const email = session.user?.email
        if (!email) return
        const res = await fetch(`${base}/api/profile?email=${encodeURIComponent(email)}`)
        if (!res.ok) return
        const data = await res.json()
        if (data) {
          setName(data.name || (session.user?.name || ''))
          setImagePreview(data.image || null)
        }
      } catch {}
    })()
  }, [session])

  useEffect(() => {
    // initialize theme state from localStorage
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem('theme') : null
      setTheme(s === 'light' || s === 'dark' ? (s as 'light' | 'dark') : 'dark')
    } catch {
      setTheme('dark')
    }
  }, [])

  const toggleTheme = (next?: 'light' | 'dark') => {
    const t = next || (theme === 'dark' ? 'light' : 'dark')
    try { localStorage.setItem('theme', t) } catch {}
    if (t === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    setTheme(t)
  }

  const onChoose = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return setImagePreview(null)
    const url = URL.createObjectURL(f)
    setImagePreview(url)
  }

  const [showPicker, setShowPicker] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const capturedBlobRef = useRef<Blob | null>(null)

  useEffect(() => {
    // attach stream to video element after UI shows the video element
    if (showCamera && streamRef.current && videoRef.current) {
      try {
        videoRef.current.srcObject = streamRef.current
        videoRef.current.muted = true
        videoRef.current.playsInline = true
        videoRef.current.autoplay = true
        // call play after attaching stream
        videoRef.current.play().catch(() => {})
      } catch (err) {
        console.error('attach stream error', err)
      }
    }
    // cleanup when hiding camera
    return () => {
      if (!showCamera && videoRef.current) {
        try { videoRef.current.srcObject = null } catch {}
      }
    }
  }, [showCamera])

  const onSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!session?.user?.email) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('email', session.user.email)
      fd.append('name', name)
      const f = fileRef.current?.files?.[0]
      if (f) fd.append('image', f)
      else if (capturedBlobRef.current) fd.append('image', capturedBlobRef.current, 'capture.png')
      const res = await fetch(`${base}/api/profile`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Save failed')
      // If server returned image path, show that instead of blob
      if (data.image) setImagePreview(data.image)
      // optionally refetch session (not implemented)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteStatus(null)
    setInviteError(null)
    if (!inviteEmail.trim()) {
      setInviteError('Bitte E-Mail angeben')
      return
    }

    setInviting(true)
    try {
      const res = await fetch(`${base}/api/auth/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'invite_failed')
      setInviteStatus('Einladung versendet')
      setInviteEmail('')
    } catch (err: any) {
      setInviteError(err?.message || 'Einladung fehlgeschlagen')
    } finally {
      setInviting(false)
    }
  }

  return (
    <main className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl sm:text-3xl font-semibold mb-4">Profil</h2>
      {session ? (
        <div className="mt-4">
          <div className="text-sm">Angemeldet als <strong className="text-black dark:text-white">{session.user?.email || session.user?.name}</strong></div>
          <div className="mt-3">
            <button onClick={() => signOut({ callbackUrl: `${base}/auth/login` })} className="action-fullmobile px-3 py-1 text-sm text-red-600 border rounded">Logout</button>
          </div>

          <div className="mt-6">
            <Link href="/locations">
              <button className="action-fullmobile px-4 py-2 bg-blue-600 text-white rounded">Lagerorte</button>
            </Link>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium mb-2">Darstellung</h3>
            <div className="flex items-center gap-3">
              <span className="text-sm">Theme:</span>
              <button onClick={() => toggleTheme('dark')} className={`px-3 py-1 rounded border ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white dark:bg-gray-700'}`}>Dunkel</button>
              <button onClick={() => toggleTheme('light')} className={`px-3 py-1 rounded border ${theme === 'light' ? 'bg-gray-200 text-black' : 'bg-white dark:bg-gray-700'}`}>Hell</button>
            </div>
          </div>

          <form onSubmit={onInvite} className="mt-6 max-w-md">
            <h3 className="text-sm font-medium mb-2">Jemanden einladen</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="E-Mail des neuen Mitglieds"
                className="w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <button type="submit" disabled={inviting} className="action-fullmobile px-4 py-2 bg-indigo-600 text-white rounded">
                {inviting ? 'Sende...' : 'Einladen'}
              </button>
            </div>
            {inviteStatus && <div className="mt-2 text-sm text-green-700 dark:text-green-400">{inviteStatus}</div>}
            {inviteError && <div className="mt-2 text-sm text-red-600">{inviteError}</div>}
          </form>

          <form onSubmit={onSave} className="mt-6 max-w-md">
            <div className="mb-3"> 
              <label className="block text-sm font-medium mb-1">Profilbild</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                  {imagePreview ? (
                    // prefer absolute path from server
                    <img src={imagePreview} alt="profil" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-xs text-gray-400">Kein Bild</div>
                  )}
                </div>
                <div>
                  <div role="button" tabIndex={0} onClick={() => setShowPicker(true)} onKeyDown={(e) => e.key === 'Enter' && setShowPicker(true)} className="text-sm text-blue-600 cursor-pointer">Bild ändern</div>
                </div>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Benutzername</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 border rounded text-black dark:text-white bg-white dark:bg-gray-800 placeholder-gray-500 dark:placeholder-gray-400" />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button type="submit" disabled={saving} className="action-fullmobile w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded">Speichern</button>
              <button type="button" onClick={() => { setImagePreview(null); if (fileRef.current) fileRef.current.value = '' }} className="action-fullmobile w-full sm:w-auto px-4 py-2 bg-gray-200 dark:bg-gray-700 text-black dark:text-white rounded">Entfernen</button>
            </div>
          </form>
          {showPicker && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded p-4 w-full max-w-sm">
                <h3 className="text-lg font-medium mb-2">Profilbild auswählen</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Datei wählen</label>
                    <input ref={fileRef} onChange={(e) => { onChoose(e) }} type="file" accept="image/*" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Oder aufnehmen</label>
                    {!showCamera && (
                      <div className="mt-2">
                        <button type="button" onClick={async () => {
                          try {
                            const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
                            streamRef.current = s
                            // show camera UI; stream will be attached in useEffect after video mounts
                            setShowCamera(true)
                          } catch (err) {
                            console.error('camera error', err)
                          }
                        }} className="action-fullmobile px-3 py-1 bg-gray-800 text-white rounded">Foto aufnehmen</button>
                      </div>
                    )}
                    {showCamera && (
                      <div className="mt-2">
                        <div className="bg-black rounded overflow-hidden">
                          <video ref={videoRef} autoPlay playsInline muted className="w-full h-56 object-cover" />
                        </div>
                        <div className="mt-2 flex gap-2 justify-end">
                          <button onClick={async () => {
                            // capture
                            if (!videoRef.current) return
                            const v = videoRef.current
                            const canvas = document.createElement('canvas')
                            canvas.width = v.videoWidth || 640
                            canvas.height = v.videoHeight || 480
                            const ctx = canvas.getContext('2d')
                            if (ctx) ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
                            const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'))
                            if (blob) {
                              capturedBlobRef.current = blob
                              const url = URL.createObjectURL(blob)
                              setImagePreview(url)
                            }
                            // stop camera
                            if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
                            if (videoRef.current) videoRef.current.srcObject = null
                            setShowCamera(false)
                          }} className="action-fullmobile px-3 py-1 bg-green-600 text-white rounded">Aufnehmen</button>
                          <button onClick={() => {
                            if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
                            if (videoRef.current) videoRef.current.srcObject = null
                            setShowCamera(false)
                          }} className="action-fullmobile px-3 py-1 bg-gray-200 rounded">Abbrechen</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setShowPicker(false)} className="action-fullmobile px-3 py-1 bg-gray-200 rounded">Fertig</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 text-sm text-gray-600">Nicht angemeldet.</div>
      )}
    </main>
  )
}
