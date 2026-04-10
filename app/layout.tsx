import '../styles/globals.css'
import BottomNav from '../components/BottomNav'
import Providers from '../components/Providers'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'nomnomstock',
  description: 'Inventory manager'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
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
      <head>
        <link rel="manifest" href={`${base}/manifest.webmanifest`} />
        <link rel="icon" type="image/svg+xml" href={`${base}/icons/icon.svg`} />
        <meta name="theme-color" content="#10b981" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </head>
      <body className="pb-28 md:pb-20">
        <Providers authBasePath={authBasePath}>
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  )
}
