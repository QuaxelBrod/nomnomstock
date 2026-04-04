import { NextResponse } from 'next/server'
import { productLookup } from '../../actions/productLookup'
import { getToken } from 'next-auth/jwt'

export async function POST(request: Request) {
  try {
    // require authentication for lookup
    // @ts-ignore
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { barcode } = body
    if (!barcode) return NextResponse.json({ error: 'barcode required' }, { status: 400 })
    const product = await productLookup(barcode)
    if (!product) return NextResponse.json({ found: false })
    return NextResponse.json({ found: true, product })
  } catch (e) {
    console.error('lookup route error', e)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
