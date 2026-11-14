require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  // Create all 500 available draw numbers. Existing numbers are left unchanged.
  // Only initialize a fresh database. Never overwrite an admin-configured capacity.
  const existingTickets = await prisma.lotteryNumber.count();
  if (existingTickets === 0) {
    await prisma.lotteryNumber.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({ number: i + 1 })),
      skipDuplicates: true
    });
  }

  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("Set ADMIN_PASSWORD in .env (at least 12 characters) before seeding.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.admin.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash }
  });
  console.log("Seed completed. Lottery capacity preserved and admin account ready.");
}
main().catch((e => { console.error(e); process.exit(1); })).finally(() => prisma.$disconnect());
