import { Request, Response, NextFunction } from "express";
import prisma from "../prisma/client";
import { verifyToken } from "../utils/jwt";
import { AuthenticatedRequest } from "../types/authencatedRequest";

/**
 * Auth middleware with optional role check
 */
export const authMiddleware =
  (roles?: Array<"USER" | "ADMIN">) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      let token: string | undefined;

      // 1️⃣ Check Authorization header (React Native, API clients)
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }

      // 2️⃣ Fallback to cookies (Next.js Admin SSR)
      if (!token && req.cookies?.access_token) {
        token = req.cookies.access_token;
      }

      if (!token) {
        return res.status(401).json({ message: "Unauthorized: Token missing" });
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      const user = await prisma.user.findUnique({
        where: { id: Number(decoded.userId) },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Attach user to request
      req.user = {
        id: user.id,
        mobile: user.mobile,
        dob: user.dob,
        name: user.name,
        isNew: !user.isProfileComplete,
        role: user.role,
      };

      // Role-based access control
      if (roles && !roles.includes(user.role)) {
        return res
          .status(403)
          .json({ message: "Forbidden: Insufficient permissions" });
      }

      next();
    } catch (error) {
      console.error("Auth Middleware Error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
