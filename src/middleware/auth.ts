import { Request, Response, NextFunction } from "express";
import prisma from "../prisma/client";
import { verifyToken } from "../utils/jwt";
import { AuthenticatedRequest } from "../types/authencatedRequest";

/**
 * Auth middleware with optional role check
 * @param roles array of roles allowed to access route
 */
export const authMiddleware =
  (roles?: Array<"USER" | "ADMIN">) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    console.log("Auth Middleware Invoked");
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized: Missing token" });
      }

      const token = authHeader.split(" ")[1];
      const decoded = verifyToken(token);

      if (!decoded) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // attach user to request
      req.user = {
        id: user.id,
        mobile: user.mobile,
        dob: user.dob,
        name: user.name,
        isNew: !user.isProfileComplete,
        role: user.role,
      };

      // check role if roles array is provided
      if (roles && !roles.includes(user.role)) {
        return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
      }

      next();
    } catch (error) {
      console.error("Auth Middleware Error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
