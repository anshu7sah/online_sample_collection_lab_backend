import { Router, Response } from "express";
import { authMiddleware } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/authencatedRequest";
import prisma from "../../prisma/client";

const router = Router();

// ─────────────────────────────────────────────
// Helper: ensure calling rider is APPROVED
// ─────────────────────────────────────────────
async function getRiderOrFail(userId: number, res: Response) {
  const rider = await prisma.rider.findUnique({ where: { userId } });
  if (!rider) {
    res.status(404).json({ message: "Rider profile not found" });
    return null;
  }
  if (rider.status !== "APPROVED") {
    res.status(403).json({ message: "Rider not approved yet" });
    return null;
  }
  return rider;
}

// ─────────────────────────────────────────────
// GET /api/rider/bookings/earnings
// Rider earnings summary
// ─────────────────────────────────────────────
router.get(
  "/earnings",
  authMiddleware(["RIDER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rider = await getRiderOrFail(req.user!.id, res);
      if (!rider) return;

      // Total earned = sum of all riderEarning across all bookings
      const earningsAgg = await prisma.booking.aggregate({
        where: { riderId: rider.id, riderEarning: { not: null } },
        _sum: { riderEarning: true },
      });

      // Completed bookings count
      const completedCount = await prisma.booking.count({
        where: { riderId: rider.id, status: "COMPLETED" },
      });

      // Pending settlement (wallet balance)
      // Pending transfers
      const pendingTransfers = await prisma.moneyTransfer.aggregate({
        where: { riderId: rider.id, type: "SETTLEMENT", status: "PENDING" },
        _sum: { amount: true },
      });

      res.json({
        walletBalance: rider.walletBalance,
        totalEarned: earningsAgg._sum.riderEarning ?? 0,
        commissionPercent: rider.commissionPercent,
        completedBookings: completedCount,
        pendingSettlementAmount: pendingTransfers._sum.amount ?? 0,
      });
    } catch (error) {
      console.error("Rider Earnings Error:", error);
      res.status(500).json({ message: "Failed to fetch earnings" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/rider/bookings/scheduled
// All SCHEDULED bookings not yet claimed by another rider
// ─────────────────────────────────────────────
router.get(
  "/scheduled",
  authMiddleware(["RIDER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rider = await getRiderOrFail(req.user!.id, res);
      if (!rider) return;

      const { page = "1", limit = "20" } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {
        status: "SCHEDULED",
        OR: [{ riderId: null }, { riderId: rider.id }],
      };

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { date: "asc" },
          include: {
            items: true,
            user: { select: { id: true, name: true, mobile: true } },
          },
        }),
        prisma.booking.count({ where }),
      ]);

      res.json({
        data: bookings,
        pagination: { page: Number(page), limit: Number(limit), total },
      });
    } catch (error) {
      console.error("Rider Scheduled Bookings Error:", error);
      res.status(500).json({ message: "Failed to fetch scheduled bookings" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/rider/bookings/my
// All bookings assigned to this rider (paginated, optional status filter)
// ─────────────────────────────────────────────
router.get(
  "/my",
  authMiddleware(["RIDER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rider = await getRiderOrFail(req.user!.id, res);
      if (!rider) return;

      const { page = "1", limit = "10", status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { riderId: rider.id };
      if (status) where.status = status;

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          include: {
            items: true,
            user: { select: { id: true, name: true, mobile: true } },
          },
        }),
        prisma.booking.count({ where }),
      ]);

      res.json({
        data: bookings,
        pagination: { page: Number(page), limit: Number(limit), total },
      });
    } catch (error) {
      console.error("Rider My Bookings Error:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/rider/bookings/completed
// Rider's COMPLETED bookings
// ─────────────────────────────────────────────
router.get(
  "/completed",
  authMiddleware(["RIDER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rider = await getRiderOrFail(req.user!.id, res);
      if (!rider) return;

      const { page = "1", limit = "10" } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where = { riderId: rider.id, status: "COMPLETED" as const };

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { updatedAt: "desc" },
          include: {
            items: true,
            user: { select: { id: true, name: true, mobile: true } },
          },
        }),
        prisma.booking.count({ where }),
      ]);

      res.json({
        data: bookings,
        pagination: { page: Number(page), limit: Number(limit), total },
      });
    } catch (error) {
      console.error("Rider Completed Bookings Error:", error);
      res.status(500).json({ message: "Failed to fetch completed bookings" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/rider/bookings/transfers
// Rider's own money transfer history
// ─────────────────────────────────────────────
router.get(
  "/transfers",
  authMiddleware(["RIDER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rider = await getRiderOrFail(req.user!.id, res);
      if (!rider) return;

      const { page = "1", limit = "10" } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where = { riderId: rider.id };

      const [transfers, total] = await Promise.all([
        prisma.moneyTransfer.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
        }),
        prisma.moneyTransfer.count({ where }),
      ]);

      res.json({
        data: transfers,
        pagination: { page: Number(page), limit: Number(limit), total },
      });
    } catch (error) {
      console.error("Rider Transfers Error:", error);
      res.status(500).json({ message: "Failed to fetch transfers" });
    }
  }
);

// ─────────────────────────────────────────────
// POST /api/rider/bookings/:id/accept
// Rider accepts a scheduled booking
// ─────────────────────────────────────────────
router.post(
  "/:id/accept",
  authMiddleware(["RIDER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rider = await getRiderOrFail(req.user!.id, res);
      if (!rider) return;

      const bookingId = Number(req.params.id);

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (booking.status !== "SCHEDULED") {
        return res.status(400).json({ message: "Booking is not in SCHEDULED status" });
      }

      if (booking.riderId && booking.riderId !== rider.id) {
        return res.status(409).json({ message: "Booking already accepted by another rider" });
      }

      // Accept booking + increment totalBookings in a transaction
      const [updatedBooking] = await prisma.$transaction([
        prisma.booking.update({
          where: { id: bookingId },
          data: {
            riderId: rider.id,
            acceptedAt: new Date(),
          },
          include: {
            items: true,
            user: { select: { id: true, name: true, mobile: true } },
          },
        }),
        prisma.rider.update({
          where: { id: rider.id },
          data: { totalBookings: { increment: 1 } },
        }),
      ]);

      res.json({ message: "Booking accepted", booking: updatedBooking });
    } catch (error) {
      console.error("Rider Accept Booking Error:", error);
      res.status(500).json({ message: "Failed to accept booking" });
    }
  }
);

// ─────────────────────────────────────────────
// PATCH /api/rider/bookings/:id/collect
// Rider marks sample as collected (and cash if PAY_LATER)
// Updates wallet, computes riderEarning, records COLLECTION transfer
// ─────────────────────────────────────────────
router.patch(
  "/:id/collect",
  authMiddleware(["RIDER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rider = await getRiderOrFail(req.user!.id, res);
      if (!rider) return;

      const bookingId = Number(req.params.id);
      const { collectionAmount } = req.body;

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (booking.riderId !== rider.id) {
        return res.status(403).json({ message: "Not your booking" });
      }

      if (booking.collectedByRider) {
        return res.status(400).json({ message: "Sample already marked as collected" });
      }

      const isPayLater = booking.paymentMode === "PAY_LATER";
      const cashCollected = isPayLater && collectionAmount ? Number(collectionAmount) : 0;

      // Rider earning = cashCollected * commissionPercent / 100
      const riderEarning = cashCollected > 0
        ? (cashCollected * rider.commissionPercent) / 100
        : 0;

      // Build transaction ops
      const ops: any[] = [
        prisma.booking.update({
          where: { id: bookingId },
          data: {
            sampleCollectedAt: new Date(),
            collectedByRider: isPayLater ? true : false,
            collectionAmount: cashCollected > 0 ? cashCollected : undefined,
            riderEarning: riderEarning > 0 ? riderEarning : undefined,
            status: "SAMPLE_COLLECTED",
          },
        }),
      ];

      // If cash collected, update wallet and record COLLECTION transfer
      if (cashCollected > 0) {
        ops.push(
          prisma.rider.update({
            where: { id: rider.id },
            data: { walletBalance: { increment: cashCollected } },
          }),
          prisma.moneyTransfer.create({
            data: {
              riderId: rider.id,
              amount: cashCollected,
              type: "COLLECTION",
              status: "APPROVED", // collection is auto-confirmed
              notes: `Cash collected for booking #${bookingId}`,
            },
          })
        );
      }

      const [updatedBooking] = await prisma.$transaction(ops);

      res.json({
        message: "Sample collected",
        booking: updatedBooking,
        cashCollected,
        riderEarning,
      });
    } catch (error) {
      console.error("Rider Collect Error:", error);
      res.status(500).json({ message: "Failed to mark collection" });
    }
  }
);

// ─────────────────────────────────────────────
// POST /api/rider/bookings/transfers/request
// Rider requests money settlement to company
// ─────────────────────────────────────────────
router.post(
  "/transfers/request",
  authMiddleware(["RIDER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rider = await getRiderOrFail(req.user!.id, res);
      if (!rider) return;

      const { amount, notes } = req.body;

      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ message: "Valid amount required" });
      }

      const requestedAmount = Number(amount);

      if (requestedAmount > Number(rider.walletBalance)) {
        return res.status(400).json({
          message: `Insufficient wallet balance. Current balance: ${rider.walletBalance}`,
        });
      }

      // Check no active pending settlement
      const existingPending = await prisma.moneyTransfer.findFirst({
        where: { riderId: rider.id, type: "SETTLEMENT", status: "PENDING" },
      });

      if (existingPending) {
        return res.status(409).json({
          message: "You already have a pending settlement request",
        });
      }

      const transfer = await prisma.moneyTransfer.create({
        data: {
          riderId: rider.id,
          amount: requestedAmount,
          type: "SETTLEMENT",
          status: "PENDING",
          notes: notes || null,
        },
      });

      res.status(201).json({ message: "Settlement request submitted", transfer });
    } catch (error) {
      console.error("Rider Settlement Request Error:", error);
      res.status(500).json({ message: "Failed to submit request" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/rider/bookings/:id
// Get single booking detail (must belong to this rider)
// ─────────────────────────────────────────────
router.get(
  "/:id",
  authMiddleware(["RIDER"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rider = await getRiderOrFail(req.user!.id, res);
      if (!rider) return;

      const bookingId = Number(req.params.id);

      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, riderId: rider.id },
        include: {
          items: true,
          user: { select: { id: true, name: true, mobile: true } },
        },
      });

      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      res.json({ booking });
    } catch (error) {
      console.error("Rider Get Booking Error:", error);
      res.status(500).json({ message: "Failed to fetch booking" });
    }
  }
);

export default router;
