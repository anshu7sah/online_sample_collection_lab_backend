import { Router, Response } from "express";
import { authMiddleware } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/authencatedRequest";
import prisma from "../../prisma/client";
import qs from "qs";


const router = Router();

// ----------------------------------
// Create Test (Admin Only)
router.post("/", authMiddleware(["ADMIN"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      department,
      testCode,
      testName,
      amount,
      methodName,
      specimen,
      specimenVolume,
      container,
      reported,
      specialInstruction,
    } = req.body;

    const test = await prisma.test.create({
      data: {
        department,
        testCode,
        testName,
        amount,
        methodName,
        specimen,
        specimenVolume,
        container,
        reported,
        specialInstruction,
      },
    });

    res.status(201).json(test);
  } catch (error) {
    console.error("Create Test Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ----------------------------------
// Get all tests (for authenticated users) with pagination


router.get("/", authMiddleware(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query = req.query;


    const whereClause: any = {};

    // Fields that support string filtering
    const stringFields = [
      "department",
      "testCode",
      "testName",
      "methodName",
      "specimen",
      "specimenVolume",
      "container",
      "reported",
      "specialInstruction",
    ];

    stringFields.forEach(field => {
      if (query[field]) {
        whereClause[field] = {
          contains: String(query[field]),
          mode: "insensitive",
        };
      }
    });

    // Amount range filter
    if (query.minAmount || query.maxAmount) {
      whereClause.amount = {};
      if (query.minAmount) whereClause.amount.gte = Number(query.minAmount);
      if (query.maxAmount) whereClause.amount.lte = Number(query.maxAmount);
      if (!Object.keys(whereClause.amount).length) delete whereClause.amount;
    }

    const [tests, total] = await Promise.all([
      prisma.test.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.test.count({ where: whereClause }),
    ]);


    res.json({
      tests,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get Tests Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get(
  "/or-search",
  authMiddleware(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const query = req.query;

      const stringFields = [
        "department",
        "testCode",
        "testName",
        "methodName",
        "specimen",
        "specimenVolume",
        "container",
        "reported",
        "specialInstruction",
      ];

      const orConditions: any[] = [];

      // 🔹 Build OR conditions dynamically
      stringFields.forEach(field => {
        if (query[field]) {
          orConditions.push({
            [field]: {
              contains: String(query[field]),
              mode: "insensitive",
            },
          });
        }
      });

      // 🔹 Amount range (still AND with OR block)
      const whereClause: any = {};

      if (orConditions.length > 0) {
        whereClause.OR = orConditions;
      }

      if (query.minAmount || query.maxAmount) {
        whereClause.amount = {};
        if (query.minAmount) whereClause.amount.gte = Number(query.minAmount);
        if (query.maxAmount) whereClause.amount.lte = Number(query.maxAmount);
      }

      const [tests, total] = await Promise.all([
        prisma.test.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.test.count({ where: whereClause }),
      ]);

      res.json({
        tests,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("OR Search Tests Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);





// ----------------------------------
// Get single test by ID (for all authenticated users)
router.get("/:id", authMiddleware(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const test = await prisma.test.findUnique({ where: { id: Number(id) } });

    if (!test) return res.status(404).json({ message: "Test not found" });

    res.json(test);
  } catch (error) {
    console.error("Get Test Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ----------------------------------
// Update Test (Admin only)
router.put("/:id", authMiddleware(["ADMIN"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const updatedTest = await prisma.test.update({
      where: { id: Number(id) },
      data,
    });

    res.json(updatedTest);
  } catch (error) {
    console.error("Update Test Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ----------------------------------
// Delete Test (Admin only)
router.delete("/:id", authMiddleware(["ADMIN"]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.test.delete({ where: { id: Number(id) } });

    res.json({ message: "Test deleted successfully" });
  } catch (error) {
    console.error("Delete Test Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
