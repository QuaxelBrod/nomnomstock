const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const household = await prisma.household.upsert({
    where: { name: 'Default Household' },
    update: {},
    create: { name: 'Default Household' },
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', householdId: household.id },
    create: {
      email: adminEmail,
      name: 'Admin',
      role: 'ADMIN',
      householdId: household.id,
    },
  });

  console.log('Seed finished: ', { householdId: household.id, adminEmail: user.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
