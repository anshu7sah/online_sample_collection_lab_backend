import { Router, Response } from "express";
import { authMiddleware } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/authencatedRequest";
import prisma from "../../prisma/client";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/notifications — Create notification
//
//   If `userId` is provided → user-specific notification (shown only to that user)
//   If `userId` is omitted  → generic broadcast (shown to ALL users)
//   `scheduledAt` is optional — future date = deferred delivery
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/notifications",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { title, body, scheduledAt, userId } = req.body;

      if (!title || !body) {
        return res.status(400).json({ message: "title and body are required" });
      }

      // If userId is specified, verify the user exists
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
        if (!user) return res.status(404).json({ message: "Target user not found" });
      }

      const notification = await prisma.notification.create({
        data: {
          title,
          body,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          userId: userId ? Number(userId) : null,
        },
      });

      res.status(201).json({
        notification,
        type: userId ? "user-specific" : "generic",
      });
    } catch (error) {
      console.error("Create Notification Error:", error);
      res.status(500).json({ message: "Failed to create notification" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/notifications — List all notifications (generic + user-specific)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/notifications",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { page = "1", limit = "10", type } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (type === "generic") where.userId = null;
      if (type === "specific") where.userId = { not: null };

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, name: true, mobile: true } },
            _count: { select: { reads: true } },
          },
        }),
        prisma.notification.count({ where }),
      ]);

      res.json({
        data: notifications,
        pagination: { page: Number(page), limit: Number(limit), total },
      });
    } catch (error) {
      console.error("List Notifications Error:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/notifications/:id — Get single notification
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/notifications/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);

      const notification = await prisma.notification.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, mobile: true } },
          _count: { select: { reads: true } },
        },
      });

      if (!notification) return res.status(404).json({ message: "Notification not found" });

      res.json({ notification });
    } catch (error) {
      console.error("Get Notification Error:", error);
      res.status(500).json({ message: "Failed to fetch notification" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/notifications/:id — Edit notification
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  "/notifications/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { title, body, scheduledAt } = req.body;

      const existing = await prisma.notification.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ message: "Notification not found" });

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (body !== undefined) updateData.body = body;
      if (scheduledAt !== undefined) {
        updateData.scheduledAt = scheduledAt === null ? null : new Date(scheduledAt);
      }

      const notification = await prisma.notification.update({
        where: { id },
        data: updateData,
      });

      res.json({ notification });
    } catch (error) {
      console.error("Update Notification Error:", error);
      res.status(500).json({ message: "Failed to update notification" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/notifications/:id — Delete notification
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/notifications/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);

      const existing = await prisma.notification.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ message: "Notification not found" });

      await prisma.notification.delete({ where: { id } });

      res.json({ message: "Notification deleted successfully" });
    } catch (error) {
      console.error("Delete Notification Error:", error);
      res.status(500).json({ message: "Failed to delete notification" });
    }
  }
);

export default router;
