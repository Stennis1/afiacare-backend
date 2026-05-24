import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'afiacare-demo';

const SEED_USERS = [
  {
    email: 'chw@afiacare.demo',
    fullName: 'Demo CHW',
    phone: '+233244000001',
    role: Role.CHW,
  },
  {
    email: 'dho@afiacare.demo',
    fullName: 'Demo DHO',
    phone: '+233244000002',
    role: Role.DHO,
  },
  {
    email: 'admin@afiacare.demo',
    fullName: 'Demo Admin',
    phone: '+233244000003',
    role: Role.ADMIN,
  },
] as const;

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, phone: u.phone, role: u.role },
      create: { ...u, passwordHash },
    });
    console.log(`  [ok] ${u.role.padEnd(7)} ${u.email}`);
  }

  console.log(`\nDemo password for all seeded users: ${DEMO_PASSWORD}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('[seed] failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
