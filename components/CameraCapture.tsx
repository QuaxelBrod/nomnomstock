"use client"

import { useRef, useState, useEffect } from 'react'

export default function CameraCapture({ onCaptured, onCancel }: { onCaptured: (dataUrl: string) => void, onCancel?: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const start = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!mounted) return
        setStream(s)
        if (videoRef.current) videoRef.current.srcObject = s
      } catch (e) {
        console.error('camera error', e)
        alert('Kamera nicht verfügbar')
      }
    }
    start()
    return () => {
      mounted = false
      if (stream) {
        stream.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  // Reattach stream to video element when user returns from preview (captured -> null)
  useEffect(() => {
    if (!captured && stream && videoRef.current) {
      try {
        videoRef.current.srcObject = stream
        // attempt to play (some browsers require explicit play)
        const p = (videoRef.current as HTMLVideoElement).play()
        if (p && typeof p.then === 'function') p.catch(() => {})
      } catch (e) {
        // ignore
      }
    }
  }, [captured, stream])

  const take = () => {
    if (!videoRef.current) return
    const v = videoRef.current
    const w = v.videoWidth || 640
    const h = v.videoHeight || 480
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, w, h)
    const data = c.toDataURL('image/jpeg', 0.85)
    setCaptured(data)
  }

  const useCaptured = () => {
    if (captured) onCaptured(captured)
  }

  return (
    <div>
      {!captured ? (
        <div>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-56 object-cover bg-black rounded" />
          <div className="mt-2 flex gap-2 justify-center">
            <button className="px-3 py-1 bg-gray-700 text-white rounded" onClick={take}>Foto</button>
            <button className="px-3 py-1 border rounded" onClick={() => { if (onCancel) onCancel() }}>Abbrechen</button>
          </div>
        </div>
      ) : (
        <div>
          <img src={captured} className="w-full h-56 object-cover rounded" alt="Preview" />
          <div className="mt-2 flex gap-2 justify-center">
            <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={useCaptured}>Verwenden</button>
            <button className="px-3 py-1 border rounded" onClick={() => setCaptured(null)}>Neu</button>
            <button className="px-3 py-1 border rounded" onClick={() => { if (onCancel) onCancel() }}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  )
}
