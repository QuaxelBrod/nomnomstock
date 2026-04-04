import '../styles/globals.css'
import BottomNav from '../components/BottomNav'
import Providers from '../components/Providers'

export const metadata = {
  title: 'nomnomstock',
  description: 'Inventory manager'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="pb-28 md:pb-20">
        <Providers>
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  )
}
