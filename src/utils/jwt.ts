import jwt, { JwtPayload } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

export function generateToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded === "string") {
      // This happens rarely, only if you signed a raw string instead of an object
      return null;
    }

    // ✅ decoded is a JwtPayload here
    return { userId: (decoded as JwtPayload).userId as string };
  } catch {
    return null;
  }
}
