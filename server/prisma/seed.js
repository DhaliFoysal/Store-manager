import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function provision(tx, storeId) {
  if (!(await tx.warehouse.count({ where: { storeId } }))) {
    await tx.warehouse.create({ data: { storeId, name: 'Main Warehouse', isDefault: true } });
  }
  for (const key of ['VCH', 'PAY', 'WTY']) {
    await tx.counter.upsert({ where: { storeId_key: { storeId, key } }, update: {}, create: { storeId, key, value: 0 } });
  }
}

async function main() {
  const email = (process.env.SUPER_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe123';

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: 'Platform Admin', email, passwordHash: await bcrypt.hash(password, 12), role: 'SUPER_ADMIN', status: 'ACTIVE' },
  });
  console.log(`Super admin ready: ${email}`);

  if (Number(process.env.SEED_DEMO) === 1) {
    const demoEmail = 'demo@example.com';
    if (!(await prisma.user.findUnique({ where: { email: demoEmail } }))) {
      await prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: {
            name: 'Demo Electronics', status: 'ACTIVE', phone: '+880 1700-000000', address: '12 Station Road, Dhaka 1000',
            voucherNotes: 'Goods once sold are not returnable. Warranty void if the seal is broken.',
          },
        });
        await tx.user.create({
          data: { storeId: store.id, name: 'Demo Owner', email: demoEmail, passwordHash: await bcrypt.hash('DemoPass123', 12), role: 'OWNER', status: 'ACTIVE' },
        });
        await provision(tx, store.id);
        await tx.category.createMany({ data: ['Mobile Phones', 'Laptops', 'Accessories'].map((name) => ({ storeId: store.id, name })) });
      });
      console.log(`Demo store ready: ${demoEmail} / DemoPass123`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
