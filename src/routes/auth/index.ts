import express, { Request, Response } from "express";
import prisma from "../../prisma/client";
import rateLimit from "express-rate-limit";
import { generateToken, verifyToken } from "../../utils/jwt";
import { generateNumericOtp, hashOtp } from "../../utils/generateOtp";
import { authMiddleware } from "../../middleware/auth";
import { hashPassword, verifyPassword } from "../../utils/password";

const router = express.Router();

/**
 * Rate limits
 */
const SEND_OTP_LIMITER = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: "Too many OTP requests, try later" },
});

const VERIFY_OTP_LIMITER = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many attempts, slow down" },
});

/**
 * SEND OTP
 */
router.post(
  "/send-otp",
  SEND_OTP_LIMITER,
  async (req: Request, res: Response) => {
    console.log("OTP Request Body:", req.body);
    const { mobile } = req.body;
    if (!mobile) return res.status(400).json({ message: "Mobile required" });

    let normalized = mobile.replace(/\s+/g, "");

    // if nepali 10 digit starting with 9 => auto convert
    if (/^9\d{9}$/.test(normalized)) {
      normalized = "+977" + normalized;
    }

    if (!/^\+\d{8,15}$/.test(normalized)) {
      return res
        .status(400)
        .json({ message: "Invalid phone format. Use E.164" });
    }

    const existing = await prisma.user.findUnique({
      where: { mobile: normalized },
    });
    if (existing?.isLocked) {
      return res.status(423).json({ message: "Account locked temporarily" });
    }

    const otp = generateNumericOtp(6);
    const otpHash = hashOtp(otp);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.user.upsert({
      where: { mobile: normalized },
      update: {
        otpHash,
        otpExpires,
        otpAttempts: 0,
        isLocked: false,
      },
      create: {
        mobile: normalized,
        otpHash,
        otpExpires,
        otpAttempts: 0,
        isLocked: false,
        isProfileComplete: false,
        role: "USER",
      },
    });

    console.log(`DEV OTP for ${normalized} = ${otp}`);

    return res.json({ success: true, message: "OTP sent" });
  }
);

/**
 * VERIFY OTP
 */
router.post(
  "/verify-otp",
  VERIFY_OTP_LIMITER,
  async (req: Request, res: Response) => {
    const { mobile, otp } = req.body;
    if (!mobile || !otp)
      return res.status(400).json({ message: "Mobile + OTP required" });

    const normalized = mobile.startsWith("+") ? mobile : "+977" + mobile;

    const user = await prisma.user.findUnique({
      where: { mobile: normalized },
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isLocked)
      return res.status(423).json({ message: "Account locked" });
    if (!user.otpHash || !user.otpExpires)
      return res.status(400).json({ message: "No OTP requested" });
    if (user.otpExpires < new Date())
      return res.status(400).json({ message: "OTP expired" });

    const providedHash = hashOtp(otp);
    if (providedHash !== user.otpHash) {
      const attempts = (user.otpAttempts || 0) + 1;
      const updates: any = { otpAttempts: attempts };
      if (attempts >= 5) updates.isLocked = true;
      await prisma.user.update({
        where: { mobile: normalized },
        data: updates,
      });
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await prisma.user.updateMany({
      where: {
        mobile: normalized,
        otpHash: user.otpHash,
        otpExpires: { gte: new Date() },
      },
      data: {
        otpHash: null,
        otpExpires: null,
        otpAttempts: 0,
        isLocked: false,
      },
    });

    // ONE TOKEN ONLY
    const token = generateToken(
      user.id,
      { purpose: "access" },
      { expiresIn: "30d" }
    );

    if (user.isProfileComplete) {
      return res.json({
        success: true,
        isNew: false,
        token,
      });
    }

    return res.json({
      success: true,
      isNew: true,
      token, // same token works
    });
  }
);

/**
 * COMPLETE SIGNUP
 */
router.post("/signup", async (req: Request, res: Response) => {
  const { name, dob } = req.body;

  const token = req.get("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token" });

  const payload = verifyToken(token);
  if (!payload) return res.status(403).json({ message: "Invalid token" });

  const user = await prisma.user.findUnique({ where: { id: +payload.userId } });
  if (!user) return res.status(404).json({ message: "User not found" });

  if (!name || !dob)
    return res.status(400).json({ message: "Name + DOB required" });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name, dob: new Date(dob), isProfileComplete: true },
  });

  return res.json({
    success: true,
    message: "Signup complete",
    token, // same token valid for 30 days
    user: {
      id: updated.id,
      name: updated.name,
      dob: updated.dob,
      mobile: updated.mobile,
    },
  });
});

/**
 * CURRENT USER
 */
router.get("/current", authMiddleware(), (req: any, res: Response) => {
  res.json({ user: req.user });
});



/**
 * ADMIN LOGIN
 */
router.post("/admin/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const admin = await prisma.user.findFirst({
      where: {
        email,
        role: "ADMIN",
      },
    });

    if (!admin || !admin.passwordHash) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isValid = verifyPassword(password, admin.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateToken(
      admin.id,
      { role: "ADMIN", purpose: "access" },
      { expiresIn: "12h" }
    );
    res.cookie("access_token", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});

    return res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/admin/create", authMiddleware(["ADMIN"]), async (req: any, res) => {
  const { name, email, password,mobile } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email & password required" });

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ message: "Admin already exists" });

  const admin = await prisma.user.create({
    data: {
      mobile,
      name,
      email,
      passwordHash: hashPassword(password),
      role: "ADMIN",
      isProfileComplete: true,
    },
  });

  res.status(201).json({
    success: true,
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    },
  });
});

router.post("/logout", authMiddleware(), (req:any, res:Response) => {
  console.log("Logging out user:", req.user.id);

  // Clear the cookie with matching options
  res.clearCookie("access_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/", // must match original cookie path
  });

  // Send a proper JSON response
  res.status(200).json({ success: true });
});





export default router;
