import { Request } from "express";
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    mobile: string;
    dob?: Date | null;
    name?: string | null;
    isNew: boolean;
    role?: "USER" | "ADMIN";
  };
}
