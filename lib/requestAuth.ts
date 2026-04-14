import { getToken } from 'next-auth/jwt'
import { prisma } from './prisma'

type AuthContext = {
  token: any
  householdId: number | null
  userId: number | null
  email: string | null
}

function parsePositiveInt(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function buildAuthContext(token: any): Promise<AuthContext> {
  const email = typeof token?.email === 'string' ? token.email : null
  const householdIdFromToken = parsePositiveInt(token?.householdId)
  const userId = parsePositiveInt(token?.sub)

  if (householdIdFromToken) {
    return { token, householdId: householdIdFromToken, userId, email }
  }

  if (!email) {
    return { token, householdId: null, userId, email: null }
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { householdId: true },
  })

  return {
    token,
    householdId: user?.householdId ?? null,
    userId,
    email,
  }
}

export async function getRequestAuthContext(request: Request) {
  // @ts-ignore
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return null
  return buildAuthContext(token)
}