"use client"

import { useMemo } from 'react'

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

function encodeCode128B(value: string) {
  const chars = value.split('')
  const values = chars.map((char) => {
    const code = char.charCodeAt(0)
    if (code < 32 || code > 127) throw new Error('unsupported_code128_char')
    return code - 32
  })

  const checksumBase = 104
  const checksum =
    (checksumBase + values.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103
  return [104, ...values, checksum, 106]
}

export default function Code128Barcode({ value }: { value: string }) {
  const bars = useMemo(() => {
    if (!value) return { rects: [] as Array<{ x: number; width: number }>, width: 0 }

    const codes = encodeCode128B(value)
    const rects: Array<{ x: number; width: number }> = []
    let x = 10

    for (const code of codes) {
      const pattern = CODE128_PATTERNS[code]
      let drawBar = true
      for (const rawWidth of pattern) {
        const width = Number(rawWidth)
        if (drawBar) rects.push({ x, width })
        x += width
        drawBar = !drawBar
      }
    }

    return { rects, width: x + 10 }
  }, [value])

  if (!value) return null

  return (
    <svg
      role="img"
      aria-label={`Barcode ${value}`}
      viewBox={`0 0 ${bars.width} 90`}
      className="block h-28 w-full bg-white"
      preserveAspectRatio="none"
    >
      <rect x="0" y="0" width={bars.width} height="90" fill="white" />
      {bars.rects.map((bar, index) => (
        <rect key={index} x={bar.x} y="8" width={bar.width} height="58" fill="black" />
      ))}
      <text x={bars.width / 2} y="82" textAnchor="middle" fontSize="11" fill="black">
        {value}
      </text>
    </svg>
  )
}
