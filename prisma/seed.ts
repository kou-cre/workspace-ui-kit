import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("Seed skipped — data is created per user at runtime.");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
