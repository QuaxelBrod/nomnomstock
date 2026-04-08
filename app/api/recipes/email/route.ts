import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { sendMail } from '../../../../lib/mail'
import { prisma } from '../../../../lib/prisma'

export async function POST(req: Request) {
  try {
    // require authenticated user
    // @ts-ignore
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { recipe, subject } = body
    if (!recipe) return NextResponse.json({ error: 'missing recipe' }, { status: 400 })

    // try to get recipient email from token, fallback to DB lookup by sub
    // token may include `email` or `sub` (user id)
    // @ts-ignore
    let email = token.email
    if (!email && token.sub) {
      const uid = Number(token.sub)
      if (!Number.isNaN(uid)) {
        const user = await prisma.user.findUnique({ where: { id: uid } })
        if (user) email = user.email
      }
    }

    if (!email) return NextResponse.json({ error: 'no email available' }, { status: 400 })

    const mailSubject = subject || 'Dein Rezept von nomnomstock'
    const text = String(recipe)
    const html = `<pre style="white-space:pre-wrap">${String(recipe).replace(/</g, '&lt;')}</pre>`

    try {
      await sendMail({ to: email, subject: mailSubject, text, html })
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'mail error' }, { status: 500 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
