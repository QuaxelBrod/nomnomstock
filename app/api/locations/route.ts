import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function GET(request: Request) {
  // require authenticated user
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const householdId = url.searchParams.get('householdId')

  const where = householdId ? { where: { householdId: Number(householdId) } } : {}

  const locations = await prisma.location.findMany({
    ...(where as object),
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(locations)
}

export async function POST(request: Request) {
  // require authenticated user
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, householdId } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const loc = await prisma.location.create({
    data: {
      name,
      householdId: householdId ? Number(householdId) : undefined,
    },
  })

  return NextResponse.json(loc)
}
