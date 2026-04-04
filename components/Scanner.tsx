"use client"

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, Result } from '@zxing/library'

type Props = {
  onDetected?: (code: string) => void
}

export default function Scanner({ onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader()
    let mounted = true

    const start = async () => {
      try {
        // Use standard Web API to enumerate devices, compatible across library versions
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter((d) => d.kind === 'videoinput')
        const deviceId = (videoDevices && videoDevices.length && (videoDevices[0] as any).deviceId) || undefined
        if (!videoRef.current) return

        codeReader.decodeFromVideoDevice(deviceId, videoRef.current, (res: Result | undefined, err: any) => {
          if (!mounted) return
          if (res) {
            const code = res.getText()
            setResult(code)
            if (onDetected) onDetected(code)
          }
        })
      } catch (e) {
        console.error('Scanner start error', e)
      }
    }

    start()

    return () => {
      mounted = false
      try {
        codeReader.reset()
      } catch (e) {
        // ignore
      }
    }
  }, [onDetected])

  return (
    <div>
      <div className="w-full max-w-md mx-auto">
        <video ref={videoRef} className="w-full rounded bg-black" />
      </div>
      <p className="mt-2 text-sm text-gray-600">Scanned: {result ?? '—'}</p>
    </div>
  )
}
