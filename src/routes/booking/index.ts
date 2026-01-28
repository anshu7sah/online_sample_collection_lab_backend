    import { Router, Response } from "express";
import { authMiddleware } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/authencatedRequest";
import prisma from "../../prisma/client";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { Readable } from "stream";


const router = Router();

// ----------------------
// Configure Multer
// ----------------------
const storage = multer.memoryStorage();
const upload = multer({ storage,limits: { fileSize: 20 * 1024 * 1024 }, });

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

// GET /bookings/my/:id
router.get(
  "/my/:id",
  authMiddleware(["USER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const bookingId = Number(req.params.id);
      const userId = req.user?.id;

      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, userId },
        include: {
          items: true,
        },
      });

      if (!booking) return res.status(404).json({ message: "Booking not found" });

      res.json({ booking });
    } catch (error) {
      console.error("User Get Booking Error:", error);
      res.status(500).json({ message: "Failed to fetch booking" });
    }
  }
);

router.get(
  "/",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("Admin Fetch Bookings Called");

    try {
      const {
        page = "1",
        limit = "10",
        status,
        paymentStatus,
        paymentMode,
        patientId,
        userId,
        date,
        timeSlot,
        mobile,
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      // --------------------- Filters ---------------------
      if (status) where.status = status;
      if (paymentStatus) where.paymentStatus = paymentStatus;
      if (paymentMode) where.paymentMode = paymentMode;
      if (userId) where.userId = Number(userId);

      // Insensitive filters
      if (patientId) {
        // Convert patientId to string and search with 'contains'
        where.patientId = {
          contains: String(patientId),
          mode: "insensitive",
        };
      }

      if (mobile) {
        where.mobile = {
          contains: String(mobile),
          mode: "insensitive",
        };
      }

      if (timeSlot) {
        where.timeSlot = {
          contains: String(timeSlot),
          mode: "insensitive",
        };
      }

      if (date) {
        where.date = {
          gte: new Date(`${date}T00:00:00.000Z`),
          lte: new Date(`${date}T23:59:59.999Z`),
        };
      }

      // --------------------- Fetch ---------------------
      const [data, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          include: {
            items: true,
            user: {
              select: { id: true, name: true, mobile: true },
            },
          },
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
    } catch (error) {
      console.error("Admin Fetch Bookings Error:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  }
);
// PATCH /admin/bookings/:id
// PATCH /admin/bookings/:id
router.patch(
  "/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("Admin Update Booking Called");
    try {
      const bookingId = Number(req.params.id);
      const body = req.body;

      // Build update data only with provided fields
      const updateData: any = {};

      if (body.status !== undefined) updateData.status = body.status;
      if (body.paymentStatus !== undefined) updateData.paymentStatus = body.paymentStatus;
      if (body.paymentMode !== undefined) updateData.paymentMode = body.paymentMode;
      if (body.name !== undefined) updateData.name = body.name;
      if (body.mobile !== undefined) updateData.mobile = body.mobile;
      if (body.age !== undefined) updateData.age = Number(body.age);
      if (body.date !== undefined) updateData.date = new Date(body.date);
      if (body.timeSlot !== undefined) updateData.timeSlot = body.timeSlot;
      if (body.latitude !== undefined) updateData.latitude = Number(body.latitude);
      if (body.longitude !== undefined) updateData.longitude = Number(body.longitude);
      if (body.patientId !== undefined) {
  const raw = body.patientId;

  // empty string, null, undefined → remove patientId
  if (raw === "" || raw === null) {
    updateData.patientId = null;
  } else {
    const patientId = Number(raw);

    if (Number.isNaN(patientId) || patientId <= 0) {
      return res.status(400).json({
        message: "Invalid patientId",
      });
    }

    const existing = await prisma.booking.findFirst({
      where: {
        patientId,
        NOT: { id: bookingId },
      },
    });

    if (existing) {
      return res.status(409).json({
        message: `Patient ID ${patientId} is already assigned`,
      });
    }

    updateData.patientId = patientId;
  }
}

  

      

      // Update booking
      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: updateData,
        include: { items: true },
      });

      res.json({ booking });
    } catch (error) {
      console.error("Admin Update Booking Error:", error);
      res.status(500).json({ message: "Failed to update booking" });
    }
  }
);

// PATCH /admin/bookings/:id/status
router.patch(
  "/:id/status",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const bookingId = Number(req.params.id);
      const { status, paymentStatus } = req.body;

      if (!status && !paymentStatus) {
        return res.status(400).json({ message: "Status or paymentStatus is required" });
      }

      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          ...(status && { status }),
          ...(paymentStatus && { paymentStatus }),
        },
      });

      res.json({ booking });
    } catch (error) {
      console.error("Admin Change Booking Status/Payment Error:", error);
      res.status(500).json({ message: "Failed to update booking" });
    }
  }
);
// GET /admin/bookings/:id
router.get(
  "/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const bookingId = Number(req.params.id);

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          items: true,
          user: {
            select: { id: true, name: true, mobile: true },
          },
        },
      });

      if (!booking) return res.status(404).json({ message: "Booking not found" });

      res.json({ booking });
    } catch (error) {
      console.error("Admin Get Booking Error:", error);
      res.status(500).json({ message: "Failed to fetch booking" });
    }
  }
);


router.post(
  "/:id/report",
  authMiddleware(["ADMIN"]),
  upload.single("report"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const bookingId = Number(req.params.id);

      if (!req.file) return res.status(400).json({ message: "Report file is required" });

      const streamUpload = (buffer: Buffer) =>
        new Promise<string>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "reports", resource_type: "raw" }, // <--- resource_type added
            (error, result) => {
              if (result) resolve(result.secure_url);
              else reject(error);
            }
          );
          streamifier.createReadStream(buffer).pipe(stream);
        });

      const reportUrl = await streamUpload(req.file.buffer);
      console.log("Uploaded Report URL:", reportUrl);

      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: { reportUrl, status: "COMPLETED" },
      });

      res.json({ booking });
    } catch (error) {
      console.error("Admin Upload Report Error:", error);
      res.status(500).json({ message: "Failed to upload report" });
    }
  }
);


router.get(
  "/:id/report/view",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const bookingId = Number(req.params.id);

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { reportUrl: true },
      });

      if (!booking?.reportUrl) {
        return res.status(404).json({ message: "Report not found" });
      }

      const response = await fetch(booking.reportUrl);

      if (!response.ok || !response.body) {
        return res.status(500).json({ message: "Failed to fetch report" });
      }

      // ✅ Convert Web Stream → Node Stream
      const nodeStream = Readable.fromWeb(response.body as any);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=report.pdf");

      nodeStream.pipe(res);
    } catch (err) {
      console.error("Stream report error:", err);
      res.status(500).json({ message: "Failed to stream report" });
    }
  }
);

router.delete(
  "/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("Admin Delete Booking Called");

    try {
      const bookingId = Number(req.params.id);

      if (Number.isNaN(bookingId)) {
        return res.status(400).json({ message: "Invalid booking id" });
      }

      // Ensure booking exists
      const existing = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { id: true },
      });

      if (!existing) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Delete in transaction
      await prisma.$transaction([
        prisma.bookingItem.deleteMany({
          where: { bookingId },
        }),
        prisma.booking.delete({
          where: { id: bookingId },
        }),
      ]);

      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      console.error("Admin Delete Booking Error:", error);
      res.status(500).json({ message: "Failed to delete booking" });
    }
  }
);










export default router;
