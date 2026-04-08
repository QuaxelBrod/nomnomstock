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

  return (
    <html lang="de">
      <head>
        <link rel="manifest" href={`${base}/manifest.webmanifest`} />
        <link rel="icon" href={`${base}/favicon.ico`} />
        <meta name="theme-color" content="#10b981" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </head>
      <body className="pb-28 md:pb-20">
        <Providers>
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  )
}
