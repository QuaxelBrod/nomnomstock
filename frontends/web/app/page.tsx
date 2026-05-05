import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default function Page() {
  const cookieStore = cookies()
  const hasSession = Boolean(
    cookieStore.get('__Secure-next-auth.session-token') ||
    cookieStore.get('next-auth.session-token')
  )

  if (hasSession) {
    redirect('/lager/')
  }

  redirect('/auth/login/')
}
