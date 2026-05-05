import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

type AuthUser = {
  id: number
  email: string
  name?: string | null
  role?: string | null
  householdId?: number | null
}

function resolveAuthBaseUrl() {
  const raw =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    'http://localhost:3000'
  return raw.replace(/\/$/, '')
}

async function authorizeAgainstBackend(email: string, password: string): Promise<AuthUser | null> {
  const base = resolveAuthBaseUrl()
  const endpoint = `${base}/api/auth/credentials`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) return null

    const body = (await res.json()) as { ok?: boolean; user?: AuthUser }
    if (!body?.ok || !body?.user) return null
    return body.user
  } catch (err) {
    console.error('[nextauth] authorize backend error', err)
    return null
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await authorizeAgainstBackend(credentials.email, credentials.password)
        if (!user) return null

        return {
          id: String(user.id),
          email: user.email,
          name: user.name || undefined,
          role: user.role || 'USER',
          householdId: user.householdId ?? null,
        } as any
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role || 'USER'
        token.householdId = (user as any).householdId ?? null
      }
      return token
    },
    async session({ session, token }) {
      ;(session.user as any) = session.user || {}
      ;(session.user as any).role = (token as any).role
      ;(session.user as any).householdId = (token as any).householdId
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
