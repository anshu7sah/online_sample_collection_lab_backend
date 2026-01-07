import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

/**
 * Generate token with optional extra payload and custom options.
 */
export function generateToken(
  userId: number,
  extraPayload: Record<string, any> = {},
  options: SignOptions = {}
) {
  return jwt.sign({ userId, ...extraPayload }, JWT_SECRET, {
    expiresIn: options.expiresIn || "7d",
    ...options,
  });
}

export function verifyToken(
  token: string
): (JwtPayload & { userId: string }) | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (!decoded.userId) return null;
    return decoded as JwtPayload & { userId: string };
  } catch {
    return null;
  }
}
