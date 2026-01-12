import express, { Response } from "express";
import XLSX from "xlsx";

import multer from "multer";
import { authMiddleware } from "../../middleware/auth";
import prisma from "../../prisma/client";
import { Prisma } from "@prisma/client";

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// helper function to normalize row keys
type ExcelRow = Record<string, unknown>;

const HEADER_MAP = {
  "Test Code": "testCode",
  "Test Name": "testName",
  "Department": "department",
  "AMOUNT": "amount",
  "Method Name": "methodName",
  "Specimen": "specimen",
  "Specimen volume": "specimenVolume",
  "Container": "container",
  "Reported": "reported",
  "Special Instruction": "specialInstruction",
} as const;

type PrismaTestField = typeof HEADER_MAP[keyof typeof HEADER_MAP];

/**
 * Normalize header key: trim and lowercase for comparison
 */
const normalize = (str: string) => str.replace(/\s+/g, "").toLowerCase();

/**
 * Normalize a row object from Excel to Prisma field names
 */
const normalizeRow = (
  row: ExcelRow,
  headerMap: Record<string, PrismaTestField>
): Partial<Record<PrismaTestField, unknown>> => {
  const normalized: Partial<Record<PrismaTestField, unknown>> = {};

  for (const [excelHeader, prismaKey] of Object.entries(headerMap)) {
    // Find matching key in the row, ignoring case and spaces
    const actualHeader = Object.keys(row).find(
      k => normalize(k) === normalize(excelHeader)
    );

    if (actualHeader && row[actualHeader] !== "" && row[actualHeader] !== undefined) {
      normalized[prismaKey] = row[actualHeader];
    }
  }

  return normalized;
};
// helper function ends here





router.get("/tests/export", authMiddleware(["ADMIN"]), async (req, res: Response) => {
  try {
    const tests = await prisma.test.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Map tests to plain JSON
    const data = tests.map(t => ({
      testCode: t.testCode,
      testName: t.testName,
      department: t.department,
      amount: t.amount,
      methodName: t.methodName,
      specimen: t.specimen,
      specimenVolume: t.specimenVolume,
      container: t.container,
      reported: t.reported,
      specialInstruction: t.specialInstruction || "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Tests");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=tests.xlsx"
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buf);
  } catch (error) {
    console.error("Export Tests Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post(
  "/tests/import",
  authMiddleware(["ADMIN"]),
  upload.single("file"),
  async (req, res: Response) => {
    console.log("Import Tests Request Received");

    try {
      if (!req.file) {
        console.error("No file uploaded");
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Read Excel
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      });

      // Find header row
      const REQUIRED_HEADERS = Object.keys(HEADER_MAP);
      const headerRowIndex = rows.findIndex(row =>
        REQUIRED_HEADERS.every(header => (row as string[]).some(cell => normalize(cell) === normalize(header)))
      );

      if (headerRowIndex === -1) {
        console.error("Header row not found");
        return res.status(400).json({ message: "Valid test header row not found in Excel file" });
      }

      const headerRow = rows[headerRowIndex] as string[];
      const dataRows = rows.slice(headerRowIndex + 1);

      // Convert rows to objects
      const rawRows: ExcelRow[] = dataRows.map(row => {
        const obj: Record<string, unknown> = {};
        headerRow.forEach((key, i) => {
          obj[key] = row[i];
        });
        return obj;
      });

      const errors: string[] = [];
      const validTests: Prisma.TestCreateManyInput[] = [];
      let totalRows = 0;
      let skippedRows = 0;

      for (const rawRow of rawRows) {
        totalRows++;

        const row = normalizeRow(rawRow, HEADER_MAP);

        // Skip empty rows
        if (!row.testCode || !row.testName) {
          skippedRows++;
          continue;
        }

        // Validate amount
        if (!row.amount || isNaN(Number(row.amount))) {
          errors.push(`Row with Test Code ${row.testCode}: invalid AMOUNT`);
          continue;
        }

        // Check uniqueness in database
        const exists = await prisma.test.findFirst({
          where: { testCode: String(row.testCode) },
          select: { id: true },
        });

        if (exists) {
          errors.push(`Test Code ${row.testCode} already exists`);
          continue;
        }

        validTests.push({
          testCode: String(row.testCode),
          testName: String(row.testName),
          department: String(row.department || ""),
          amount: Number(row.amount),
          methodName: String(row.methodName || ""),
          specimen: String(row.specimen || ""),
          specimenVolume: String(row.specimenVolume || ""),
          container: String(row.container || ""),
          reported: String(row.reported || ""),
          specialInstruction: row.specialInstruction ? String(row.specialInstruction) : null,
        });
      }

      // Bulk insert valid tests
      await prisma.test.createMany({
        data: validTests,
        skipDuplicates: true,
      });

      // Summary report
      const report = {
        totalRows,
        uploaded: validTests.length,
        skipped: skippedRows,
        errors: errors.length,
        errorDetails: errors,
      };

      console.log("Import Report:", report);

      res.json({
        message: "Import completed",
        report,
      });
    } catch (error) {
      console.error("Import Tests Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);




export default router;
