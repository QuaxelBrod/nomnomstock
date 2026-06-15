import OfferCatalog from '../../components/offers/OfferCatalog'

export const dynamic = 'force-dynamic'

export default function AngebotePage() {
  return (
    <main className="p-4 sm:p-6 max-w-3xl mx-auto pb-28 md:pb-20">
      <OfferCatalog />
    </main>
  )
}
