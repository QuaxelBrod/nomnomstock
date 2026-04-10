"use client"

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, Result } from '@zxing/library'

type Props = {
  onDetected?: (code: string) => void
  cameraMode?: 'environment' | 'user'
}

export default function Scanner({ onDetected, cameraMode = 'environment' }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)
  const startedRef = useRef(false)
  const lastCodeRef = useRef<string | null>(null)
  const lastTimeRef = useRef<number>(0)

  useEffect(() => {
    let mounted = true

    const stopScanner = () => {
      try {
        if (codeReaderRef.current) {
          try {
            codeReaderRef.current.reset()
          } catch (e) {
            // ignore
          }
        }
        // stop media tracks if any
        if (videoRef.current && (videoRef.current.srcObject as MediaStream)) {
          const s = videoRef.current.srcObject as MediaStream
          s.getTracks().forEach((t) => {
            try {
              t.stop()
            } catch (e) {
              // ignore
            }
          })
          try {
            videoRef.current.srcObject = null
          } catch (e) {
            // ignore
          }
        }
        startedRef.current = false
      } catch (e) {
        // ignore
      }
    }

    const start = async () => {
      try {
        if (!videoRef.current) return

        // instantiate reader once
        if (!codeReaderRef.current) codeReaderRef.current = new BrowserMultiFormatReader()
        const codeReader = codeReaderRef.current

        // ensure clean state
        try {
          codeReader.reset()
        } catch (_) {}

        // Prefer facingMode where possible (mobile camera switch), fallback to deviceId selection.
        const constraints = {
          video: {
            facingMode: { ideal: cameraMode },
          },
        }

        const onFrame = (res: Result | undefined, err: any) => {
          if (!mounted) return
          if (res) {
            const code = res.getText()
            setResult(code)

            const now = Date.now()
            const last = lastCodeRef.current
            const lastTime = lastTimeRef.current || 0

            // Only call onDetected when the code changed, or if enough time passed since last call
            const COOLDOWN = 3000 // ms
            if (code !== last || now - lastTime > COOLDOWN) {
              lastCodeRef.current = code
              lastTimeRef.current = now
              if (onDetected) onDetected(code)
            }
          }
        }

        const anyReader = codeReader as any
        if (typeof anyReader.decodeFromConstraints === 'function') {
          await anyReader.decodeFromConstraints(constraints, videoRef.current, onFrame)
        } else {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const videoDevices = devices.filter((d) => d.kind === 'videoinput')
          const wanted = cameraMode === 'environment' ? /(back|rear|environment)/i : /(front|user|face)/i
          const selected = videoDevices.find((d) => wanted.test(d.label || '')) || videoDevices[0]
          const deviceId = selected?.deviceId
          await codeReader.decodeFromVideoDevice(deviceId, videoRef.current, onFrame)
        }

        startedRef.current = true
      } catch (e) {
        console.error('Scanner start error', e)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopScanner()
      } else if (document.visibilityState === 'visible') {
        start()
      }
    }

    start()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', handleVisibility)
      stopScanner()
    }
  }, [onDetected, cameraMode])

  return (
    <div>
      <div className="w-full max-w-md mx-auto">
        <video
          ref={videoRef}
          className="w-full rounded bg-black h-64 object-cover"
          playsInline
          autoPlay
          muted
        />
      </div>
      <p className="mt-2 text-sm text-gray-600">Scanned: {result ?? '—'}</p>
    </div>
  )
}
