import type { NormalizedOffer, OfferSource, RetailerKey, ScanTargetInput } from '../types'

export type RetailerConnector = {
  key: RetailerKey
  resolveScanTargets(postalCode: string): ScanTargetInput[]
  sourceUrls(target: ScanTargetInput): string[]
  extractOffers?(target: ScanTargetInput, source: OfferSource): Promise<NormalizedOffer[]>
}
