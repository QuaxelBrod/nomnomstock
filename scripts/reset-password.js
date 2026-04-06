const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const email = process.env.EMAIL
const newPw = process.env.NEW_PW

if (!email || !newPw) {
  console.error('Usage: EMAIL=you@host NEW_PW=secret node scripts/reset-password.js')
  process.exit(1)
}

;(async () => {
  try {
    const hash = bcrypt.hashSync(newPw, 10)
    const user = await prisma.user.update({
      where: { email },
      data: { password: hash, isActive: true },
    })
    console.log('Updated user:', { id: user.id, email: user.email, isActive: user.isActive })
  } catch (err) {
    console.error('Error:', err.message || err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
})()
