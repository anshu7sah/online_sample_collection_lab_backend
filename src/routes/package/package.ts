import { Router, Response } from "express";
import prisma from "../../prisma/client";
import { authMiddleware } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/authencatedRequest";

const router = Router();

/* =====================================================
   CREATE PACKAGE (ADMIN)
===================================================== */
router.post(
  "/",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, description, price, testIds } = req.body;

      if (!name || typeof price !== "number" || !Array.isArray(testIds)) {
        return res.status(400).json({
          message: "name, price and testIds[] are required",
        });
      }

      const testIdsArray: number[] = testIds
        .map((id: unknown) => Number(id))
        .filter(Number.isFinite);

      if (!testIdsArray.length) {
        return res.status(400).json({ message: "Invalid testIds" });
      }

      // Validate tests
      const testCount = await prisma.test.count({
        where: { id: { in: testIdsArray } },
      });

      if (testCount !== testIdsArray.length) {
        return res.status(400).json({ message: "Some testIds do not exist" });
      }

      // Create package
      const pkg = await prisma.package.create({
        data: { name, description, price },
      });

      // Create relations
      await prisma.packageOnTest.createMany({
        data: testIdsArray.map((testId: number) => ({
          packageId: pkg.id,
          testId,
        })),
        skipDuplicates: true,
      });

      const fullPackage = await prisma.package.findUnique({
        where: { id: pkg.id },
        include: { tests: { include: { test: true } } },
      });

      res.status(201).json(formatPackage(fullPackage));
    } catch (error) {
      console.error("Create Package Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

/* =====================================================
   GET ALL PACKAGES (AUTH USERS) + PAGINATION
===================================================== */
router.get(
  "/",
  authMiddleware(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const query = req.query;

      const whereClause: any = {};

      // Package-level string filters
      const stringFields = ["name", "description"];

      stringFields.forEach((field) => {
        if (query[field]) {
          whereClause[field] = {
            contains: String(query[field]),
            mode: "insensitive",
          };
        }
      });

      // Test-level string filters (nested)
      const testStringFields = [
        "testName",
        "testCode",
        "department",
        "methodName",
        "specimen",
        "specimenVolume",
        "container",
        "reported",
        "specialInstruction",
      ];

      const testFilters: any = {};
      testStringFields.forEach((field) => {
        if (query[field]) {
          testFilters[field] = {
            contains: String(query[field]),
            mode: "insensitive",
          };
        }
      });

     if (Object.keys(testFilters).length > 0) {
  whereClause.tests = {
    some: {
      test: testFilters, // OR logic across tests
    },
  };
}


      // Price filter
      if (query.minPrice || query.maxPrice) {
        whereClause.price = {};
        if (query.minPrice) whereClause.price.gte = Number(query.minPrice);
        if (query.maxPrice) whereClause.price.lte = Number(query.maxPrice);
        if (!Object.keys(whereClause.price).length) delete whereClause.price;
      }

      const [packages, total] = await Promise.all([
        prisma.package.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          where: whereClause,
          include: { tests: { include: { test: true } } },
        }),
        prisma.package.count({ where: whereClause }),
      ]);

      res.json({
        data: packages.map(formatPackage),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get Packages Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);


/* =====================================================
   GET SINGLE PACKAGE (AUTH USERS)
===================================================== */
router.get(
  "/:id",
  authMiddleware(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const packageId = Number(req.params.id);
      if (!Number.isFinite(packageId)) {
        return res.status(400).json({ message: "Invalid package id" });
      }

      const pkg = await prisma.package.findUnique({
        where: { id: packageId },
        include: { tests: { include: { test: true } } },
      });

      if (!pkg) {
        return res.status(404).json({ message: "Package not found" });
      }

      res.json(formatPackage(pkg));
    } catch (error) {
      console.error("Get Package Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

/* =====================================================
   UPDATE PACKAGE (ADMIN)
===================================================== */
router.put(
  "/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const packageId = Number(req.params.id);
      if (!Number.isFinite(packageId)) {
        return res.status(400).json({ message: "Invalid package id" });
      }

      const { name, description, price, testIds } = req.body;

      const testIdsArray: number[] = Array.isArray(testIds)
        ? testIds.map((id: unknown) => Number(id)).filter(Number.isFinite)
        : [];

      await prisma.package.update({
        where: { id: packageId },
        data: { name, description, price },
      });

      if (testIdsArray.length) {
        await prisma.packageOnTest.deleteMany({
          where: { packageId },
        });

        await prisma.packageOnTest.createMany({
          data: testIdsArray.map((testId: number) => ({
            packageId,
            testId,
          })),
          skipDuplicates: true,
        });
      }

      const updated = await prisma.package.findUnique({
        where: { id: packageId },
        include: { tests: { include: { test: true } } },
      });

      res.json(formatPackage(updated));
    } catch (error) {
      console.error("Update Package Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

/* =====================================================
   DELETE PACKAGE (ADMIN)
===================================================== */
router.delete(
  "/:id",
  authMiddleware(["ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const packageId = Number(req.params.id);
      if (!Number.isFinite(packageId)) {
        return res.status(400).json({ message: "Invalid package id" });
      }

   await prisma.$transaction(async (tx) => {
  await tx.packageOnTest.deleteMany({
    where: { packageId },
  });

  await tx.package.delete({
    where: { id: packageId },
  });
});


      res.json({ message: "Package deleted successfully" });
    } catch (error) {
      console.error("Delete Package Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

/* =====================================================
   RESPONSE FORMATTER
===================================================== */
function formatPackage(pkg: any) {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    price: pkg.price,
    tests: pkg.tests.map((t: any) => t.test),
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  };
}

export default router;
