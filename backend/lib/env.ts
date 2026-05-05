// Normalize DATABASE_URL early to ensure Prisma validates the datasource correctly
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./data/nomnom.db'
} else if (!/^[a-zA-Z]+:/.test(process.env.DATABASE_URL)) {
  process.env.DATABASE_URL = `file:${process.env.DATABASE_URL}`
}

if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = 'devsecret'
}

export {}
