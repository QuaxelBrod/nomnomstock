"use client"

import { useEffect, useRef, useState } from 'react'
import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType, Result } from '@zxing/library'

type Props = {
  onDetected?: (code: string) => void
  cameraMode?: 'environment' | 'user'
}

export default function Scanner({ onDetected, cameraMode = 'environment' }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
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
        trackRef.current = null
        setTorchSupported(false)
        setTorchOn(false)
        startedRef.current = false
      } catch (e) {
        // ignore
      }
    }

    const detectTorchSupport = () => {
      try {
        const stream = videoRef.current?.srcObject as MediaStream | null
        const track = stream?.getVideoTracks?.()[0] || null
        trackRef.current = track
        const caps: any = track && typeof (track as any).getCapabilities === 'function'
          ? (track as any).getCapabilities()
          : null
        setTorchSupported(!!caps?.torch)
      } catch {
        setTorchSupported(false)
      }
    }

    const start = async () => {
      try {
        if (!videoRef.current) return

        // instantiate reader once
        if (!codeReaderRef.current) {
          const hints = new Map<any, any>()
          hints.set(DecodeHintType.TRY_HARDER, true)
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.ITF,
            BarcodeFormat.CODABAR,
            BarcodeFormat.QR_CODE,
            BarcodeFormat.DATA_MATRIX,
          ])
          codeReaderRef.current = new BrowserMultiFormatReader(hints, 200)
        }
        const codeReader = codeReaderRef.current

        // ensure clean state
        try {
          codeReader.reset()
        } catch (_) {}

        // Prefer facingMode where possible (mobile camera switch), fallback to deviceId selection.
        const constraints = {
          video: {
            facingMode: { ideal: cameraMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, min: 15 },
            focusMode: 'continuous',
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

        setTimeout(detectTorchSupport, 350)

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

  const toggleTorch = async () => {
    try {
      const track = trackRef.current || ((videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks?.()[0] || null)
      if (!track) return
      const next = !torchOn
      await (track as any).applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch (e) {
      console.warn('Torch toggle failed', e)
      setTorchOn(false)
    }
  }

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
      {torchSupported && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={toggleTorch}
            className={`px-3 py-1 rounded text-sm border ${torchOn ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-white dark:bg-gray-800 text-black dark:text-white border-gray-300 dark:border-gray-600'}`}
          >
            {torchOn ? 'Lampe aus' : 'Lampe ein'}
          </button>
        </div>
      )}
      <p className="mt-2 text-sm text-gray-600">Scanned: {result ?? '—'}</p>
    </div>
  )
}
