import '../styles/globals.css'
import BottomNav from '../components/BottomNav'
import Providers from '../components/Providers'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'nomnomstock',
  description: 'Inventory manager'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const base = (() => {
    const explicit = process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || ''
    if (explicit) return explicit
    try {
      const raw = process.env.NEXTAUTH_URL || process.env.APP_URL || ''
      if (!raw) return ''
      const p = new URL(raw).pathname
      return p === '/' ? '' : p.replace(/\/$/, '')
    } catch {
      return ''
    }
  })()
  const authBasePrefix = (() => {
    try {
      const raw = process.env.NEXTAUTH_URL || ''
      if (!raw) return base
      const parsed = new URL(raw)
      const p = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')
      return p || base
    } catch {
      return base
    }
  })()
  const authBasePath = `${authBasePrefix}/api/auth`.replace(/\/\/+/g, '/')

  return (
    <html lang="de">
      <body>
        <Providers authBasePath={authBasePath}>
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  )
}
