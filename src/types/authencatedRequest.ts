import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    mobile: string;
    name: string | null;
    dob: Date | null;
    isNew: Boolean;
  };
}
