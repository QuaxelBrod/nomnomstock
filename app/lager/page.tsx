export const dynamic = 'force-dynamic'

import dynamicImport from 'next/dynamic'

const StockList = dynamicImport(() => import('../../components/StockList'), { ssr: false })

export default function LagerPage() {
  return (
    <main className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl sm:text-3xl font-semibold mb-2">Lager</h2>
      <p className="mb-4 text-sm sm:text-base text-gray-600 dark:text-gray-300">Bestandsübersicht</p>
      <StockList />
    </main>
  )
}
