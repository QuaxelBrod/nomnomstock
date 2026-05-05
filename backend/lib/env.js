// In development force the usage of local SQLite to avoid accidental
// connections to other databases (e.g. corporate POSTGRES envs).
// You can override by setting FORCE_SQLITE_URL env var.
if (process.env.NODE_ENV !== 'production') {
  const forced = process.env.FORCE_SQLITE_URL || 'file:./data/nomnom.db'
  process.env.DATABASE_URL = forced
  // small debug note for developer
  // eslint-disable-next-line no-console
  console.warn('[env] Development mode: forcing DATABASE_URL =', process.env.DATABASE_URL)
} else {
  // In production, ensure we have at least a NEXTAUTH_SECRET default (should be overridden)
  if (!process.env.NEXTAUTH_SECRET) process.env.NEXTAUTH_SECRET = 'prod-secret-please-set'
}

// Ensure a fallback NEXTAUTH_SECRET in dev so next-auth doesn't fail
if (!process.env.NEXTAUTH_SECRET) process.env.NEXTAUTH_SECRET = 'devsecret'

module.exports = {}
