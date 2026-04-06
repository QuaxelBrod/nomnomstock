import { prisma } from '../../lib/prisma'
import ShoppingItem from '../../components/ShoppingItem'
import AddShoppingItem from '../../components/AddShoppingItem'
import Recommendations from '../../components/Recommendations'

export default async function EinkaufPage() {
  const items = await prisma.shoppingListItem.findMany({
    orderBy: { createdAt: 'desc' },
    include: { product: true, addedBy: true },
  })

  return (
    <main className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl sm:text-3xl font-semibold mb-3">Einkauf</h2>

      {items.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">Keine Einträge auf der Einkaufsliste.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="p-3 border rounded bg-white dark:bg-gray-900 dark:border-gray-800">
              <ShoppingItem item={it} />
            </li>
          ))}

          <li className="p-3">
            <AddShoppingItem showOnlyButton />
          </li>

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
