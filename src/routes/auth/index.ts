import express, { Request, Response } from "express";
import prisma from "../../prisma/client";
import rateLimit from "express-rate-limit";
import { generateToken, verifyToken } from "../../utils/jwt";
import { generateNumericOtp, hashOtp } from "../../utils/generateOtp";
import { authMiddleware } from "../../middleware/auth";
import { hashPassword, verifyPassword } from "../../utils/password";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import crypto from "crypto";
import { sendEmail } from "../../utils/sendEmail";


const router = express.Router();


const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 }, });

// ----------------------
// Configure Cloudinary
// ----------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
 * @swagger
 * /api/auth/send-otp:
 *   post:
 *     summary: Send OTP
 *     description: Send OTP to mobile number for authentication
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mobile
 *             properties:
 *               mobile:
 *                 type: string
 *                 description: Mobile number in E.164 format
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Invalid mobile number
 *       423:
 *         description: Account locked
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
  const { name, email, password, mobile } = req.body;

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

router.post("/logout", authMiddleware(), (req: any, res: Response) => {
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


// Rider routes
router.post(
  "/rider/signup",
  upload.fields([
    { name: "drivingLicense", maxCount: 1 },
    { name: "labDegree", maxCount: 1 },
  ]),
  async (req: any, res: Response) => {
    try {
      const {
        name,
        email,
        dateOfBirth,
        password,
        confirmPassword,
        mobile
      } = req.body;

      if (!name || !email || !password || !confirmPassword || !dateOfBirth) {
        return res.status(400).json({ message: "All fields required" });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match" });
      }

      const existing = await prisma.user.findUnique({
        where: { email },
      });

      if (existing) {
        return res.status(409).json({ message: "Email already registered" });
      }

      const drivingLicenseFile = req.files?.drivingLicense?.[0];
      const labDegreeFile = req.files?.labDegree?.[0];

      if (!drivingLicenseFile || !labDegreeFile) {
        return res.status(400).json({
          message: "Driving license and lab degree required",
        });
      }

      const uploadToCloudinary = (
        buffer: Buffer,
        folder: string
      ): Promise<string> => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder },
            (error, result) => {
              if (result) resolve(result.secure_url);
              else reject(error);
            }
          );
          streamifier.createReadStream(buffer).pipe(stream);
        });
      };

      // ----------------------
      // Upload Files
      // ----------------------
      const drivingLicenseUrl = await uploadToCloudinary(
        drivingLicenseFile.buffer,
        "riders/driving-licenses"
      );

      const labDegreeUrl = await uploadToCloudinary(
        labDegreeFile.buffer,
        "riders/lab-degrees"
      );

      const hashedPassword = hashPassword(password);

      // ----------------------
      // Transaction
      // ----------------------
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name,
            email,
            dob: new Date(dateOfBirth),
            mobile: mobile,
            passwordHash: hashedPassword,
            role: "RIDER",
            isProfileComplete: true,
          },
        });

        const rider = await tx.rider.create({
          data: {
            userId: user.id,
            drivingLicenseUrl,
            labDegreeUrl,
            status: "PENDING",
          },
        });

        return { user, rider };
      });

      return res.status(201).json({
        success: true,
        message: "Application submitted. Await admin approval.",
        riderId: result.rider.id,
      });
    } catch (error) {
      console.error("Rider Signup Error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);


// ─────────────────────────────────────────────
// RIDER LOGIN
// POST /api/auth/rider/login
// ─────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/rider/login:
 *   post:
 *     summary: Rider Login
 *     description: Login for an approved rider.
 *     tags:
 *       - Rider Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       '200':
 *         description: OK (Returns JWT token and profile)
 *       '403':
 *         description: Forbidden (Rider is not APPROVED)
 */
router.post("/rider/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const user = await prisma.user.findFirst({
      where: { email, role: "RIDER" },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isValid = verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check rider record and APPROVED status
    const rider = await prisma.rider.findUnique({ where: { userId: user.id } });
    if (!rider) {
      return res.status(404).json({ message: "Rider profile not found" });
    }

    if (rider.status !== "APPROVED") {
      return res.status(403).json({
        message: `Rider account is ${rider.status.toLowerCase()}. Please wait for admin approval.`,
        status: rider.status,
      });
    }

    const token = generateToken(
      user.id,
      { role: "RIDER", purpose: "access" },
      { expiresIn: "30d" }
    );

    return res.json({
      success: true,
      token,
      rider: {
        id: rider.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.mobile,
        status: rider.status,
        commissionPercent: rider.commissionPercent,
        walletBalance: rider.walletBalance,
        totalBookings: rider.totalBookings,
        rating: rider.rating,
      },
    });
  } catch (error) {
    console.error("Rider Login Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/rider/profile", authMiddleware(["RIDER"]), async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const rider = await prisma.rider.findUnique({
      where: { userId },
      include: { user: true },
    });

    res.status(200).json({ rider });
  } catch (error) {
    console.error("Rider Profile Fetch Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
// ─────────────────────────────────────────────
router.patch(
  "/rider/profile",
  authMiddleware(["RIDER"]),
  async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { name, phone, dob } = req.body;

      // Update user fields
      const userUpdate: any = {};
      if (name !== undefined) userUpdate.name = name;
      if (dob !== undefined) userUpdate.dob = new Date(dob);


      const riderUpdate: any = {};
      if (phone !== undefined) riderUpdate.phone = phone;

      const [updatedUser, updatedRider] = await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: userUpdate,
          select: { id: true, name: true, email: true, dob: true, mobile: true },
        }),
        prisma.rider.update({
          where: { userId },
          data: riderUpdate,
          select: {
            id: true,
            status: true,
            commissionPercent: true,
            walletBalance: true,
            rating: true,
            totalBookings: true,
          },
        }),
      ]);

      return res.json({
        success: true,
        message: "Profile updated",
        user: updatedUser,
        rider: updatedRider,
      });
    } catch (error) {
      console.error("Rider Profile Edit Error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────
// RIDER FORGOT PASSWORD
// POST /api/auth/rider/forgot-password
// ─────────────────────────────────────────────
router.post("/rider/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await prisma.user.findFirst({ where: { email, role: "RIDER" } });

    // Always return 200 to prevent email enumeration
    if (!user) {
      return res.json({ message: "If that email exists, a reset link has been sent." });
    }

    // Generate a secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpires: expires,
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/rider/reset-password?token=${rawToken}`;

    await sendEmail({
      to: user.email!,
      subject: "Reset Your Password – Lab App",
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name || "Rider"},</p>
        <p>You requested a password reset. Click the link below to set a new password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a>
        <p>If you did not request this, please ignore this email.</p>
      `,
    });

    return res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (error) {
    console.error("Rider Forgot Password Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
// RIDER RESET PASSWORD
// POST /api/auth/rider/reset-password
// ─────────────────────────────────────────────
router.post("/rider/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ message: "token, password, and confirmPassword are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Hash the incoming raw token to compare with stored hash
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpires: { gt: new Date() },
        role: "RIDER",
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Token is invalid or has expired" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    return res.json({ success: true, message: "Password reset successfully. You can now log in." });
  } catch (error) {
    console.error("Rider Reset Password Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
