import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const email = process.env.MASTER_EMAIL || process.argv[2]
const password = process.env.MASTER_PASSWORD || process.argv[3]
const name = process.env.MASTER_NAME || 'Master'

if (!email || !password) {
  console.error('Usage: MASTER_EMAIL=foo MASTER_PASSWORD=bar node scripts/create_master_user.mjs [email] [password]')
  process.exit(1)
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.error('User already exists:', email)
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({ data: { email, name, role: 'MASTER', password: hash } })
  console.log('Created master user:', { id: user.id, email: user.email })
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
