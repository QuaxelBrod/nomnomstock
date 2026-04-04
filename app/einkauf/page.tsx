import { prisma } from '../../lib/prisma'
import ShoppingItem from '../../components/ShoppingItem'
import AddShoppingItem from '../../components/AddShoppingItem'

export default async function EinkaufPage() {
  const items = await prisma.shoppingListItem.findMany({
    orderBy: { createdAt: 'desc' },
    include: { product: true, addedBy: true },
  })

  return (
    <main className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Einkauf</h2>

      {items.length === 0 ? (
        <p>Keine Einträge auf der Einkaufsliste.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="p-3 border rounded">
              <ShoppingItem item={it} />
            </li>
          ))}
          <li className="p-3">
            <AddShoppingItem />
          </li>
        </ul>
      )}
    </main>
  )
}
