import { cookies } from 'next/headers'
import ShoppingItem from '../../components/ShoppingItem'
import AddShoppingItem from '../../components/AddShoppingItem'
import Recommendations from '../../components/Recommendations'
import OfferPlanner from '../../components/offers/OfferPlanner'
import { ApiClient } from 'nomnomstock-shared'

export const dynamic = 'force-dynamic'

export default async function EinkaufPage() {
  let items: any[] = []
  let loadError: string | null = null
  try {
    const backendBase = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || ''
    const client = new ApiClient(backendBase)
    // forward incoming cookies so backend can infer auth/session
    const cookieHeader = cookies().toString()
    const res = await client.getShopping({ headers: cookieHeader ? { cookie: cookieHeader } : undefined })
    items = res?.items || []
  } catch (err: any) {
    console.error('[einkauf] failed to load shopping list', err)
    loadError = 'Einkaufsliste konnte nicht geladen werden. Bitte Migrationen pruefen und erneut versuchen.'
  }

  return (
    <main className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl sm:text-3xl font-semibold mb-3">Einkauf</h2>

      <div className="mb-4">
        <AddShoppingItem showOnlyButton />
      </div>

      <OfferPlanner itemCount={items.length} />

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">{loadError}</p>
      )}

      {items.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Keine Einträge auf der Einkaufsliste.</p>
          <Recommendations />
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it:any) => (
            <li key={it.id} className="p-3 border rounded bg-white dark:bg-gray-900 dark:border-gray-800">
              <ShoppingItem item={it} />
            </li>
          ))}

          <li className="flex items-center my-3">
            <span className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
            <span className="px-3 text-xs text-gray-400">Empfohlen</span>
            <span className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
          </li>

          <li className="p-3">
            <Recommendations />
          </li>
        </ul>
      )}
    </main>
  )
}
