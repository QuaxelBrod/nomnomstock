import dynamic from 'next/dynamic'

const StockList = dynamic(() => import('../../components/StockList'), { ssr: false })

export default function LagerPage() {
  return (
    <main className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Lager</h2>
      <p className="mb-4">Bestandsübersicht</p>
      <StockList />
    </main>
  )
}
