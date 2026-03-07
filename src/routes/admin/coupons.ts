import { Router, Response } from "express";
import { authMiddleware } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/authencatedRequest";
import prisma from "../../prisma/client";

const router = Router();

// ─────────────────────────────────────────────
// POST /api/admin/coupons — Create coupon
// ─────────────────────────────────────────────
router.post(
  "/coupons",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { code, discountType, discountValue, maxUses, validFrom, validUntil, isActive } = req.body;

      if (!code || discountValue === undefined) {
        return res.status(400).json({ message: "code and discountValue are required" });
      }

      if (!["PERCENTAGE", "FLAT"].includes(discountType)) {
        return res.status(400).json({ message: "discountType must be PERCENTAGE or FLAT" });
      }

      const value = Number(discountValue);
      if (isNaN(value) || value <= 0) {
        return res.status(400).json({ message: "discountValue must be a positive number" });
      }

      if (discountType === "PERCENTAGE" && value > 100) {
        return res.status(400).json({ message: "Percentage discount cannot exceed 100" });
      }

      // Check for duplicate code
      const existing = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
      if (existing) {
        return res.status(409).json({ message: "Coupon code already exists" });
      }

      const coupon = await prisma.coupon.create({
        data: {
          code: code.toUpperCase(),
          discountType: discountType || "PERCENTAGE",
          discountValue: value,
          maxUses: maxUses ? Number(maxUses) : 1,
          validFrom: validFrom ? new Date(validFrom) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      });

      res.status(201).json({ coupon });
    } catch (error) {
      console.error("Create Coupon Error:", error);
      res.status(500).json({ message: "Failed to create coupon" });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/admin/coupons — List all coupons
// ─────────────────────────────────────────────
router.get(
  "/coupons",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { page = "1", limit = "10", isActive } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (isActive !== undefined) where.isActive = isActive === "true";

      const [coupons, total] = await Promise.all([
        prisma.coupon.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { bookings: true } } },
        }),
        prisma.coupon.count({ where }),
      ]);

      res.json({
        data: coupons,
        pagination: { page: Number(page), limit: Number(limit), total },
      });
    } catch (error) {
      console.error("List Coupons Error:", error);
      res.status(500).json({ message: "Failed to fetch coupons" });
    }
  }
);

// ─────────────────────────────────────────────
// PATCH /api/admin/coupons/:id — Update coupon
// ─────────────────────────────────────────────
router.patch(
  "/coupons/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { code, discountType, discountValue, maxUses, validFrom, validUntil, isActive } = req.body;

      const existing = await prisma.coupon.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ message: "Coupon not found" });

      const updateData: any = {};
      if (code !== undefined) {
        const codeUpper = code.toUpperCase();
        const dup = await prisma.coupon.findFirst({ where: { code: codeUpper, NOT: { id } } });
        if (dup) return res.status(409).json({ message: "Coupon code already exists" });
        updateData.code = codeUpper;
      }
      if (discountType !== undefined) updateData.discountType = discountType;
      if (discountValue !== undefined) updateData.discountValue = Number(discountValue);
      if (maxUses !== undefined) updateData.maxUses = Number(maxUses);
      if (validFrom !== undefined) updateData.validFrom = validFrom ? new Date(validFrom) : null;
      if (validUntil !== undefined) updateData.validUntil = validUntil ? new Date(validUntil) : null;
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);

      const coupon = await prisma.coupon.update({ where: { id }, data: updateData });

      res.json({ coupon });
    } catch (error) {
      console.error("Update Coupon Error:", error);
      res.status(500).json({ message: "Failed to update coupon" });
    }
  }
);

// ─────────────────────────────────────────────
// DELETE /api/admin/coupons/:id — Delete coupon
// ─────────────────────────────────────────────
router.delete(
  "/coupons/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);

      const existing = await prisma.coupon.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ message: "Coupon not found" });

      await prisma.coupon.delete({ where: { id } });

      res.json({ message: "Coupon deleted successfully" });
    } catch (error) {
      console.error("Delete Coupon Error:", error);
      res.status(500).json({ message: "Failed to delete coupon" });
    }
  }
);

export default router;
