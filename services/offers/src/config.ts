import type { RetailerKey } from './types'

export const RETAILERS: Record<RetailerKey, { key: RetailerKey; name: string; urls: string[] }> = {
  aldi: {
    key: 'aldi',
    name: 'ALDI',
    urls: ['https://www.aldi-nord.de/angebote.html', 'https://www.aldi-sued.de/de/angebote.html'],
  },
  cap: {
    key: 'cap',
    name: 'CAP',
    urls: ['https://cap-markt.de/angebote/'],
  },
  edeka: {
    key: 'edeka',
    name: 'EDEKA',
    urls: ['https://www.edeka.de/marktsuche.jsp'],
  },
  kaufland: {
    key: 'kaufland',
    name: 'Kaufland',
    urls: ['https://filiale.kaufland.de/angebote/uebersicht.html'],
  },
  lidl: {
    key: 'lidl',
    name: 'Lidl',
    urls: ['https://www.lidl.de/c/angebote'],
  },
  marktkauf: {
    key: 'marktkauf',
    name: 'Marktkauf',
    urls: ['https://www.marktkauf.de/marktangebote', 'https://www.marktkauf.de/online-wochenangebote/kat-M0794'],
  },
  netto: {
    key: 'netto',
    name: 'Netto',
    urls: ['https://www.netto-online.de/angebote'],
  },
  norma: {
    key: 'norma',
    name: 'NORMA',
    urls: ['https://www.norma-online.de/de/angebote/'],
  },
  rewe: {
    key: 'rewe',
    name: 'REWE',
    urls: ['https://www.rewe.de/angebote/'],
  },
}

export const DEFAULT_RETAILERS = Object.keys(RETAILERS) as RetailerKey[]

export function normalizeRetailerKeys(value: unknown): RetailerKey[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : []
  const keys = raw
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry): entry is RetailerKey => entry in RETAILERS)
  return Array.from(new Set(keys.length ? keys : DEFAULT_RETAILERS))
}

export function normalizePostalCode(value: unknown) {
  const postalCode = String(value || '').trim()
  return /^[0-9A-Za-z][0-9A-Za-z\-\s]{2,12}$/.test(postalCode) ? postalCode : ''
}

export function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function isTruthy(value: string | undefined) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}
