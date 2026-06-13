const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Ensure DB has required columns (idempotent)
  // Some deployments may have an older DB where migrations were not applied
  // Query pragma table_info and add columns if missing.
  try {
    const cols = await prisma.$queryRawUnsafe("PRAGMA table_info('User');");
    const names = (cols || []).map((c) => c.name);
    if (!names.includes('image')) {
      // SQLite allows adding columns; default NULL
      await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "image" TEXT;');
      console.log('[seed] added column `image`');
    }
    if (!names.includes('password')) {
      await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "password" TEXT;');
      console.log('[seed] added column `password`');
    }
    if (!names.includes('isActive')) {
      await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT 0;');
      console.log('[seed] added column `isActive`');
    }
  } catch (e) {
    console.warn('[seed] could not ensure columns:', e && e.message ? e.message : e);
  }
  const household = await prisma.household.upsert({
    where: { name: 'Default Household' },
    update: {},
    create: { name: 'Default Household' },
  });

  const defaultLocation = await prisma.location.findFirst({
    where: { householdId: household.id, name: 'Vorrat' },
  });

  if (!defaultLocation) {
    await prisma.location.create({ data: { householdId: household.id, name: 'Vorrat' } });
  }

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
