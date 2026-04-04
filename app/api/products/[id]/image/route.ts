import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/prisma'
import fs from 'fs'
import path from 'path'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

    const body = await request.json()
    const { data } = body // expected data: base64 string like 'data:image/jpeg;base64,...'
    if (!data) return NextResponse.json({ error: 'no data' }, { status: 400 })

    // parse base64
    const m = data.match(/^data:(image\/(png|jpe?g));base64,(.+)$/)
    if (!m) return NextResponse.json({ error: 'invalid data' }, { status: 400 })
    const mime = m[1]
    const ext = mime.includes('png') ? 'png' : 'jpg'
    const b64 = m[3]
    const buffer = Buffer.from(b64, 'base64')

    // ensure uploads dir
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

    const filename = `product-${id}-${Date.now()}.${ext}`
    const filepath = path.join(uploadsDir, filename)
    fs.writeFileSync(filepath, buffer)

    const url = `/uploads/${filename}`

    // update product
    await prisma.product.update({ where: { id }, data: { image: url } })

    return NextResponse.json({ ok: true, url })
  } catch (e) {
    console.error('upload image error', e)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
