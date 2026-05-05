import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import type { NextAuthOptions } from 'next-auth'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma as any),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const fs = await import('fs')
          fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] authorize ${JSON.stringify({ email: credentials?.email })}\n`)
        } catch {}
        console.log('[nextauth] authorize', { email: credentials?.email })
        if (!credentials?.email || !credentials?.password) {
          try { const fs = await import('fs'); fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] missing credentials\n`) } catch {}
          console.log('[nextauth] missing credentials')
          return null
        }

        try { await (await import('./dbFixes')).ensurePasswordColumn() } catch {}

        const user = await prisma.user.findUnique({ where: { email: credentials.email } })
        try { const fs = await import('fs'); fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] found user=${!!user}\n`) } catch {}
        console.log('[nextauth] found user', !!user)
        if (!user) return null
        if (!(user as any).isActive) {
          try { const fs = await import('fs'); fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] user not active\n`) } catch {}
          console.log('[nextauth] user not active')
          return null
        }

        const hash = (user as any).password
        if (!hash) {
          try { const fs = await import('fs'); fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] no password hash\n`) } catch {}
          console.log('[nextauth] no password hash on user')
          return null
        }

        const valid = await bcrypt.compare(credentials.password, hash)
        if (!valid) {
          try { const fs = await import('fs'); fs.appendFileSync('/tmp/nextauth-authorize.log', `[${new Date().toISOString()}] invalid password\n`) } catch {}
          console.log('[nextauth] invalid password')
          return null
        }

        return {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          householdId: user.householdId,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // @ts-ignore
        token.role = (user as any).role || 'USER'
        // @ts-ignore
        token.householdId = (user as any).householdId
      }
      return token
    },
    async session({ session, token }) {
      // @ts-ignore
      session.user = session.user || {}
      // @ts-ignore
      session.user.role = token.role
      // @ts-ignore
      session.user.householdId = token.householdId
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
