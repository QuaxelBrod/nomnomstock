import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '../../../../lib/prisma'
import bcrypt from 'bcryptjs'

const handler = NextAuth({
  adapter: PrismaAdapter(prisma as any),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        // ensure password column exists (best-effort fix for local dev)
        try { await (await import('../../../../lib/dbFixes')).ensurePasswordColumn() } catch {}

        const user = await prisma.user.findUnique({ where: { email: credentials.email } })
        if (!user) return null
        // prevent login if account not active
        if (!(user as any).isActive) {
          // return null to indicate failure; could throw for better message handling
          return null
        }
        // user.password may not exist for oauth users
        // compare password
        // We store plaintext? We will store hashed password in registration flow.
        // If no password set, deny.
        // @ts-ignore
        const hash = (user as any).password
        if (!hash) return null
        const valid = await bcrypt.compare(credentials.password, hash)
        if (!valid) return null
        return { id: user.id.toString(), email: user.email, name: user.name, role: user.role, householdId: user.householdId }
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
})

export { handler as GET, handler as POST }
