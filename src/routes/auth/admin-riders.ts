import { Router, Response } from "express";
import { authMiddleware } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/authencatedRequest";
import prisma from "../../prisma/client";

const router = Router();

// ═══════════════════════════════════════════════
// ADMIN — RIDER MANAGEMENT
// ═══════════════════════════════════════════════

// GET /api/admin/riders — list all riders
router.get(
  "/riders",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, page = "1", limit = "10" } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (status) where.status = status;

      const [riders, total] = await Promise.all([
        prisma.rider.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: { id: true, name: true, email: true, mobile: true },
            },
          },
        }),
        prisma.rider.count({ where }),
      ]);

      res.json({
        data: riders,
        pagination: { page: Number(page), limit: Number(limit), total },
      });
    } catch (error) {
      console.error("Admin List Riders Error:", error);
      res.status(500).json({ message: "Failed to fetch riders" });
    }
  }
);

// GET /api/admin/riders/revenue — revenue graph data
router.get(
  "/riders/revenue",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { period = "monthly", riderId } = req.query;

      let truncBy: string;
      switch (period) {
        case "daily":
          truncBy = "day";
          break;
        case "yearly":
          truncBy = "year";
          break;
        default:
          truncBy = "month";
      }

      const riderFilter =
        riderId ? `AND b."riderId" = ${Number(riderId)}` : "";

      // Raw SQL for date_trunc grouping
      const rows: any[] = await prisma.$queryRawUnsafe(`
        SELECT
          date_trunc('${truncBy}', b."date") AS period,
          COUNT(b.id)::int                   AS booking_count,
          COALESCE(SUM(b."collectionAmount"), 0)::float AS total_collection,
          COALESCE(SUM(b."riderEarning"), 0)::float     AS total_rider_earning
        FROM "Booking" b
        WHERE b.status IN ('SAMPLE_COLLECTED','COMPLETED')
          ${riderFilter}
        GROUP BY 1
        ORDER BY 1 ASC
      `);

      res.json({ period, data: rows });
    } catch (error) {
      console.error("Admin Revenue Graph Error:", error);
      res.status(500).json({ message: "Failed to fetch revenue data" });
    }
  }
);

// GET /api/admin/riders/:id — single rider detail
router.get(
  "/riders/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const riderId = Number(req.params.id);

      const rider = await prisma.rider.findUnique({
        where: { id: riderId },
        include: {
          user: {
            select: { id: true, name: true, email: true, mobile: true, dob: true },
          },
          bookings: {
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { items: true },
          },
          moneyTransfers: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

      if (!rider) return res.status(404).json({ message: "Rider not found" });

      res.json({ rider });
    } catch (error) {
      console.error("Admin Get Rider Error:", error);
      res.status(500).json({ message: "Failed to fetch rider" });
    }
  }
);

// PATCH /api/admin/riders/:id/approve — approve rider + set commissionPercent
router.patch(
  "/riders/:id/approve",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const riderId = Number(req.params.id);
      const { commissionPercent } = req.body;

      if (commissionPercent === undefined || commissionPercent === null) {
        return res.status(400).json({ message: "commissionPercent is required" });
      }

      const commission = Number(commissionPercent);
      if (isNaN(commission) || commission < 0 || commission > 100) {
        return res.status(400).json({ message: "commissionPercent must be 0–100" });
      }

      const existing = await prisma.rider.findUnique({ where: { id: riderId } });
      if (!existing) return res.status(404).json({ message: "Rider not found" });

      const rider = await prisma.rider.update({
        where: { id: riderId },
        data: { status: "APPROVED", commissionPercent: commission },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      res.json({ message: "Rider approved", rider });
    } catch (error) {
      console.error("Admin Approve Rider Error:", error);
      res.status(500).json({ message: "Failed to approve rider" });
    }
  }
);

// PATCH /api/admin/riders/:id/status — change rider status (REJECTED/SUSPENDED/PENDING)
router.patch(
  "/riders/:id/status",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const riderId = Number(req.params.id);
      const { status } = req.body;

      const allowed = ["PENDING", "REJECTED", "SUSPENDED", "APPROVED"];
      if (!status || !allowed.includes(status)) {
        return res
          .status(400)
          .json({ message: `status must be one of: ${allowed.join(", ")}` });
      }

      const rider = await prisma.rider.update({
        where: { id: riderId },
        data: { status },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      res.json({ message: "Rider status updated", rider });
    } catch (error) {
      console.error("Admin Update Rider Status Error:", error);
      res.status(500).json({ message: "Failed to update status" });
    }
  }
);

// ═══════════════════════════════════════════════
// ADMIN — MONEY TRANSFER MANAGEMENT
// ═══════════════════════════════════════════════

// GET /api/admin/transfers — list all transfer requests
router.get(
  "/transfers",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, type, page = "1", limit = "10" } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (status) where.status = status;
      if (type) where.type = type;

      const [transfers, total] = await Promise.all([
        prisma.moneyTransfer.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          include: {
            rider: {
              include: {
                user: { select: { id: true, name: true, email: true, mobile: true } },
              },
            },
          },
        }),
        prisma.moneyTransfer.count({ where }),
      ]);

      res.json({
        data: transfers,
        pagination: { page: Number(page), limit: Number(limit), total },
      });
    } catch (error) {
      console.error("Admin List Transfers Error:", error);
      res.status(500).json({ message: "Failed to fetch transfers" });
    }
  }
);

// PATCH /api/admin/transfers/:id/approve — approve settlement → deduct wallet
router.patch(
  "/transfers/:id/approve",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const transferId = Number(req.params.id);
      const adminId = req.user!.id;

      const transfer = await prisma.moneyTransfer.findUnique({
        where: { id: transferId },
        include: { rider: true },
      });

      if (!transfer) {
        return res.status(404).json({ message: "Transfer not found" });
      }

      if (transfer.status !== "PENDING") {
        return res.status(400).json({ message: "Transfer is not in PENDING state" });
      }

      if (transfer.type !== "SETTLEMENT") {
        return res.status(400).json({ message: "Only SETTLEMENT transfers can be approved here" });
      }

      const transferAmount = Number(transfer.amount);
      const walletBalance = Number(transfer.rider.walletBalance);

      if (transferAmount > walletBalance) {
        return res.status(400).json({
          message: `Rider wallet balance (${walletBalance}) is less than transfer amount (${transferAmount})`,
        });
      }

      const [updatedTransfer] = await prisma.$transaction([
        prisma.moneyTransfer.update({
          where: { id: transferId },
          data: {
            status: "APPROVED",
            approvedDate: new Date(),
            approvedById: adminId,
          },
        }),
        prisma.rider.update({
          where: { id: transfer.riderId },
          data: { walletBalance: { decrement: transferAmount } },
        }),
      ]);

      res.json({ message: "Transfer approved", transfer: updatedTransfer });
    } catch (error) {
      console.error("Admin Approve Transfer Error:", error);
      res.status(500).json({ message: "Failed to approve transfer" });
    }
  }
);

// PATCH /api/admin/transfers/:id/reject — reject settlement
router.patch(
  "/transfers/:id/reject",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const transferId = Number(req.params.id);
      const adminId = req.user!.id;
      const { notes } = req.body;

      const transfer = await prisma.moneyTransfer.findUnique({
        where: { id: transferId },
      });

      if (!transfer) {
        return res.status(404).json({ message: "Transfer not found" });
      }

      if (transfer.status !== "PENDING") {
        return res.status(400).json({ message: "Transfer is not in PENDING state" });
      }

      const updated = await prisma.moneyTransfer.update({
        where: { id: transferId },
        data: {
          status: "REJECTED",
          approvedDate: new Date(),
          approvedById: adminId,
          notes: notes || transfer.notes,
        },
      });

      res.json({ message: "Transfer rejected", transfer: updated });
    } catch (error) {
      console.error("Admin Reject Transfer Error:", error);
      res.status(500).json({ message: "Failed to reject transfer" });
    }
  }
);

export default router;
