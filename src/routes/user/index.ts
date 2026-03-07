import { Router, Response } from "express";
import { authMiddleware } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/authencatedRequest";
import prisma from "../../prisma/client";

const router = Router();

// ─────────────────────────────────────────────
// POST /api/user/addresses — Save a new address
// ─────────────────────────────────────────────
router.post(
  "/addresses",
  authMiddleware(["USER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { label, address, latitude, longitude } = req.body;

      if (!label || !address || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ message: "label, address, latitude, longitude are required" });
      }

      const saved = await prisma.savedAddress.create({
        data: {
          userId,
          label,
          address,
          latitude: Number(latitude),
          longitude: Number(longitude),
        },
      });

      res.status(201).json({ savedAddress: saved });
    } catch (error) {
      console.error("Save Address Error:", error);
      res.status(500).json({ message: "Failed to save address" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/user/addresses — List all saved addresses
// ─────────────────────────────────────────────
router.get(
  "/addresses",
  authMiddleware(["USER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const addresses = await prisma.savedAddress.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      res.json({ addresses });
    } catch (error) {
      console.error("List Addresses Error:", error);
      res.status(500).json({ message: "Failed to fetch addresses" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/user/addresses/:id — Get single address
// ─────────────────────────────────────────────
router.get(
  "/addresses/:id",
  authMiddleware(["USER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = Number(req.params.id);

      const address = await prisma.savedAddress.findFirst({
        where: { id, userId },
      });

      if (!address) return res.status(404).json({ message: "Address not found" });

      res.json({ address });
    } catch (error) {
      console.error("Get Address Error:", error);
      res.status(500).json({ message: "Failed to fetch address" });
    }
  }
);

// ─────────────────────────────────────────────
// PUT /api/user/addresses/:id — Update address
// ─────────────────────────────────────────────
router.put(
  "/addresses/:id",
  authMiddleware(["USER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = Number(req.params.id);
      const { label, address, latitude, longitude } = req.body;

      const existing = await prisma.savedAddress.findFirst({
        where: { id, userId },
      });
      if (!existing) return res.status(404).json({ message: "Address not found" });

      const updateData: any = {};
      if (label !== undefined) updateData.label = label;
      if (address !== undefined) updateData.address = address;
      if (latitude !== undefined) updateData.latitude = Number(latitude);
      if (longitude !== undefined) updateData.longitude = Number(longitude);

      const updated = await prisma.savedAddress.update({
        where: { id },
        data: updateData,
      });

      res.json({ savedAddress: updated });
    } catch (error) {
      console.error("Update Address Error:", error);
      res.status(500).json({ message: "Failed to update address" });
    }
  }
);

// ─────────────────────────────────────────────
// DELETE /api/user/addresses/:id — Delete address
// ─────────────────────────────────────────────
router.delete(
  "/addresses/:id",
  authMiddleware(["USER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = Number(req.params.id);

      const existing = await prisma.savedAddress.findFirst({
        where: { id, userId },
      });
      if (!existing) return res.status(404).json({ message: "Address not found" });

      await prisma.savedAddress.delete({ where: { id } });

      res.json({ message: "Address deleted successfully" });
    } catch (error) {
      console.error("Delete Address Error:", error);
      res.status(500).json({ message: "Failed to delete address" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/user/stats — User booking statistics
// ─────────────────────────────────────────────
router.get(
  "/stats",
  authMiddleware(["USER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const [total, completed, upcoming, cancelled, sampleCollected] = await Promise.all([
        prisma.booking.count({ where: { userId } }),
        prisma.booking.count({ where: { userId, status: "COMPLETED" } }),
        prisma.booking.count({ where: { userId, status: "SCHEDULED" } }),
        prisma.booking.count({ where: { userId, status: "CANCELLED" } }),
        prisma.booking.count({ where: { userId, status: "SAMPLE_COLLECTED" } }),
      ]);

      res.json({
        stats: {
          total,
          completed,
          upcoming,
          cancelled,
          sampleCollected,
        },
      });
    } catch (error) {
      console.error("User Stats Error:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/user/notifications — All published notifications for this user
//   Includes: generic (userId=null) + user-specific (userId=me)
//   Only shows notifications that are published (scheduledAt null or in the past)
// ─────────────────────────────────────────────
router.get(
  "/notifications",
  authMiddleware(["USER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { page = "1", limit = "20" } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const now = new Date();

      // Published (scheduledAt null or in past) AND (generic OR for this specific user)
      const where: any = {
        AND: [
          {
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
          },
          {
            OR: [{ userId: null }, { userId }],
          },
        ],
      };

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          include: {
            reads: {
              where: { userId },
              select: { readAt: true },
            },
          },
        }),
        prisma.notification.count({ where }),
      ]);

      const data = notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.userId ? "personal" : "generic",
        bookingId: n.bookingId,
        scheduledAt: n.scheduledAt,
        createdAt: n.createdAt,
        isRead: n.reads.length > 0,
        readAt: n.reads[0]?.readAt ?? null,
      }));

      res.json({
        data,
        pagination: { page: Number(page), limit: Number(limit), total },
      });
    } catch (error) {
      console.error("User Notifications Error:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  }
);

// ─────────────────────────────────────────────
// POST /api/user/notifications/:id/read — Mark as read
// ─────────────────────────────────────────────
router.post(
  "/notifications/:id/read",
  authMiddleware(["USER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const notificationId = Number(req.params.id);

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });
      if (!notification) return res.status(404).json({ message: "Notification not found" });

      await prisma.notificationRead.upsert({
        where: { userId_notificationId: { userId, notificationId } },
        update: {},
        create: { userId, notificationId },
      });

      res.json({ message: "Marked as read" });
    } catch (error) {
      console.error("Mark Read Error:", error);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  }
);

export default router;
