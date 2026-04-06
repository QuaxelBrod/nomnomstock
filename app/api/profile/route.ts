import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import fs from 'fs'
import path from 'path'

// api/profile supports GET?email=... to fetch user and POST to update (multipart form)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const email = url.searchParams.get('email')
    if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 })
    // Prisma schema may not include `image` field; select core fields first
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } as any })
    if (!user) return NextResponse.json(null)
    // try to read image column via raw SQL if it exists
    try {
      const rows: any = await prisma.$queryRaw`SELECT image FROM "User" WHERE email = ${email}`
      if (rows && rows[0] && rows[0].image) (user as any).image = rows[0].image
    } catch (e) {
      // ignore if column doesn't exist or query fails
    }
    return NextResponse.json(user || null)
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const email = String(form.get('email') || '')
    const name = String(form.get('name') || '')
    if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 })

    // ensure image column exists (best-effort)
    try { await (await import('../../../lib/dbFixes')).ensureImageColumn() } catch {}

    let imagePath: string | null = null
    const file = form.get('image') as any
    if (file && typeof file.stream === 'function') {
      const uploads = path.join(process.cwd(), 'public', 'uploads')
      try { fs.mkdirSync(uploads, { recursive: true }) } catch {}
      const ext = (file.name && path.extname(file.name)) || '.jpg'
      const nameOnDisk = `profile-${Date.now()}${Math.random().toString(36).slice(2,8)}${ext}`
      const dest = path.join(uploads, nameOnDisk)
      // `file` may be a Web File/Blob: use arrayBuffer() to get bytes
      try {
        if (typeof file.arrayBuffer === 'function') {
          const ab = await file.arrayBuffer()
          fs.writeFileSync(dest, Buffer.from(ab))
        } else if (typeof file.stream === 'function') {
          // fallback for Node streams
          const stream = file.stream()
          await new Promise((res, rej) => {
            const out = fs.createWriteStream(dest)
            stream.pipe(out)
            stream.on('end', res)
            stream.on('error', rej)
          })
        } else {
          // last resort: try text
          const txt = String(file)
          fs.writeFileSync(dest, txt)
        }
      } catch (e) {
        // rethrow to be caught by outer handler
        throw e
      }
      imagePath = `/uploads/${nameOnDisk}`
    }

    // build update
    if (!name && !imagePath) return NextResponse.json({ ok: true })

    // update name via Prisma client if provided
    if (name) {
      await prisma.user.update({ where: { email }, data: { name } as any })
    }

    // update image via raw SQL if Prisma schema doesn't have `image`
    if (imagePath) {
      try {
        await prisma.$executeRaw`UPDATE "User" SET image = ${imagePath} WHERE email = ${email}`
      } catch (e) {
        // ignore errors
      }
    }

    return NextResponse.json({ ok: true, image: imagePath || null })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
