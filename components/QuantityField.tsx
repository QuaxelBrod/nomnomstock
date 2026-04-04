"use client"

import { useEffect, useState } from 'react'

type Props = {
  value?: number
  min?: number
  onChange: (v: number) => void
  className?: string
}

export default function QuantityField({ value, min = 1, onChange, className = '' }: Props) {
  const [str, setStr] = useState<string>(value != null ? String(value) : '')

  useEffect(() => {
    setStr(value != null ? String(value) : '')
  }, [value])

  const commit = (s: string) => {
    const n = Number(s)
    if (Number.isFinite(n) && n >= (min ?? 1)) {
      onChange(n)
      setStr(String(n))
    } else {
      // if empty or invalid, fallback to min
      onChange(min)
      setStr(String(min))
    }
  }

  const inc = () => {
    const n = Number(str) || min
    const next = Math.max(min, Math.floor(n) + 1)
    onChange(next)
  }

  const dec = () => {
    const n = Number(str) || min
    const next = Math.max(min, Math.floor(n) - 1)
    onChange(next)
  }

  return (
    <div className={`inline-flex items-center border rounded ${className}`}>
      <button type="button" onClick={dec} className="px-2 py-1 text-sm hover:bg-gray-100">−</button>
      <input
        type="number"
        className="w-20 px-2 py-1 text-center outline-none"
        min={min}
        value={str}
        onChange={(e) => setStr(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value) }}
      />
      <button type="button" onClick={inc} className="px-2 py-1 text-sm hover:bg-gray-100">+</button>
    </div>
  )
}
