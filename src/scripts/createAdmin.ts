import prisma from "../prisma/client";
import { hashPassword } from "../utils/password";

async function createAdmin() {
  const email = "admin@yourapp.com";
  const password = "ChangeThis@123";
  const name = "Super Admin";
  const mobile="9825872858"

  const exists = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (exists) {
    console.log("❌ Admin already exists");
    process.exit(0);
  }

  const admin = await prisma.user.create({
    data: {
        mobile,
      email,
      name,
      passwordHash: hashPassword(password),
      role: "ADMIN",
      isProfileComplete: true,
    },
  });

  console.log("✅ Admin created:");
  console.log({
    email: admin.email,
    password: password,
  });
}

createAdmin()
  .catch(console.error)
  .finally(() => process.exit(0));
