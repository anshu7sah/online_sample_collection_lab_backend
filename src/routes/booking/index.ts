    import { Router, Response } from "express";
import { authMiddleware } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/authencatedRequest";
import prisma from "../../prisma/client";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

const router = Router();

// ----------------------
// Configure Multer
// ----------------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ----------------------
// Configure Cloudinary
// ----------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ----------------------
// Create Booking
// ----------------------
router.post(
  "/",
  authMiddleware(["USER", "ADMIN"]),
  upload.single("file"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const {
        name,
        age,
        gender,
        mobile,
        address,
        latitude,
        longitude,
        date,
        timeSlot,
        prcDoctor,
        paymentMode,
      } = req.body;

      // ----------------------
      // Upload prescription to Cloudinary if present
      // ----------------------
      let prescriptionFileUrl = null;
      if (req.file) {
        const streamUpload = (buffer: Buffer) =>
          new Promise<string>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: "prescriptions" },
              (error, result) => {
                if (result) resolve(result.secure_url);
                else reject(error);
              }
            );
            streamifier.createReadStream(buffer).pipe(stream);
          });

        prescriptionFileUrl = await streamUpload(req.file.buffer);
      }

      // ----------------------
      // Create Booking
      // ----------------------
      const booking = await prisma.booking.create({
        data: {
          userId,
          name,
          age: Number(age),
          gender,
          mobile,
          address,
          latitude: Number(latitude),
          longitude: Number(longitude),
          date: new Date(date),
          timeSlot,
          prcDoctor: prcDoctor || null,
          hasPrescription: !!prescriptionFileUrl,
          prescriptionFile: prescriptionFileUrl || null,
          paymentMode: paymentMode || null,

          // Add booking items
          items: {
            create: req.body.items?.map((item: any) => ({
              type: item.type,
              name: item.name,
              price: Number(item.price),
              testId: Number(item.testId) || null,
              packageId: Number(item.packageId) || null,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      res.status(201).json({ booking });
    } catch (error) {
      console.error("Create Booking Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET /api/bookings/my?status=SCHEDULED&page=1&limit=10
router.get(
  "/my",
  authMiddleware(["USER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { status, page = "1", limit = "10" } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { userId };
      if (status) where.status = status;

      const [data, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          include: { items: true },
        }),
        prisma.booking.count({ where }),
      ]);

      res.json({
        data,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
        },
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  }
);

export default router;
