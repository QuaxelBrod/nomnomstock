import { prisma } from '../../../lib/prisma'
import Link from 'next/link'
import dynamicImport from 'next/dynamic'

type Props = { params: { id: string } }

export default async function ProductPage({ params }: Props) {
  const id = Number(params.id)
  const product = await prisma.product.findUnique({ where: { id }, include: { stocks: { include: { location: true } }, histories: true } })
  if (!product) return (<main className="p-6"><h2 className="text-xl font-semibold">Produkt nicht gefunden</h2></main>)

  const MoveStock = dynamicImport(() => import('../../../components/MoveStock'), { ssr: false })
  const ReduceStock = dynamicImport(() => import('../../../components/ReduceStock'), { ssr: false })

  return (
    <main className="p-6">
      <div className="mb-4">
        <Link href="/lager" className="text-sm text-blue-600">← Zurück zum Vorrat</Link>
      </div>
      <div className="flex gap-6">
        {product.image && <img src={product.image} alt={product.name} className="w-32 h-32 object-cover rounded" />}
        <div>
          <h2 className="text-2xl font-semibold">{product.name}</h2>
          <div className="text-sm text-gray-600">Barcode: {product.barcode}</div>
          <div className="mt-4">
            <h3 className="font-medium">Bestände</h3>
            <ul className="mt-2 space-y-1">
              {product.stocks.map((s: any) => (
                <li key={s.id} className="text-sm flex items-center justify-between">
                  <span>{s.quantity} {s.unit ?? ''} — {s.location?.name ?? '—'}</span>
                  <span className="ml-3"><ReduceStock stockId={s.id} /></span>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <MoveStock productId={product.id} stocks={product.stocks} />
            </div>
          </div>
            <div className="mt-8">
            <h3 className="font-medium">Verlauf</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {product.histories.map((h: any) => (
                <li key={h.id}>{new Date(h.createdAt).toLocaleString()} — {h.action} {h.quantity}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
