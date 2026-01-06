import { Request } from "express";
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    mobile: string;
    dob?: Date | null;
    name?: string | null;
    isNew: boolean;
    role?: "USER" | "ADMIN";
  };
}
