import express, { Request, Response } from "express";
import { generateOtp } from "../../utils/generateOtp";
import { generateToken } from "../../utils/jwt";
import prisma from "../../prisma/client";
import { authMiddleware } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/authencatedRequest";

const router = express.Router();

/**
 * STEP 1: SEND OTP
 */
router.post("/send-otp", async (req: Request, res: Response) => {
  console.log("sdvnsk");
  const { mobile } = req.body;
  if (!mobile)
    return res.status(400).json({ message: "Mobile number required" });

  const otp = generateOtp();
  const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // valid for 5 mins

  // Upsert user
  const user = await prisma.user.upsert({
    where: { mobile },
    update: { otpCode: otp, otpExpires },
    create: { mobile, otpCode: otp, otpExpires },
  });

  // TODO: Integrate SMS API here to actually send OTP
  console.log(`OTP for ${mobile}: ${otp}`);

  return res.json({ success: true, message: "OTP sent successfully" });
});

/**
 * STEP 2: VERIFY OTP
 */
router.post("/verify-otp", async (req: Request, res: Response) => {
  const { mobile, otp } = req.body;
  if (!mobile || !otp)
    return res.status(400).json({ message: "Mobile and OTP required" });

  const user = await prisma.user.findUnique({ where: { mobile } });
  if (!user) return res.status(404).json({ message: "User not found" });

  if (user.otpCode !== otp)
    return res.status(400).json({ message: "Invalid OTP" });

  if (user.otpExpires && user.otpExpires < new Date())
    return res.status(400).json({ message: "OTP expired" });

  // OTP verified — clear OTP fields
  await prisma.user.update({
    where: { mobile },
    data: { otpCode: null, otpExpires: null },
  });

  const token = generateToken(user.id);
  const isNew = !user.isProfileComplete;

  return res.json({
    success: true,
    token,
    isNew,
  });
});

/**
 * STEP 3: SIGNUP (complete profile)
 */
router.post("/signup", async (req: Request, res: Response) => {
  const { name, dob, mobile } = req.body;
  if (!name || !dob || !mobile)
    return res.status(400).json({ message: "Name, DOB, and Mobile required" });

  const user = await prisma.user.findUnique({ where: { mobile } });
  if (!user) return res.status(404).json({ message: "User not found" });

  const updated = await prisma.user.update({
    where: { mobile },
    data: {
      name,
      dob: new Date(dob),
      isProfileComplete: true,
    },
  });

  return res.json({
    success: true,
    message: "Signup complete",
    user: {
      id: updated.id,
      name: updated.name,
      dob: updated.dob,
      mobile: updated.mobile,
    },
  });
});

router.get(
  "current",
  authMiddleware,
  (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
  }
);

export default router;
