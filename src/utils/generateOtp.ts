// helpers (utils/secureOtp.ts)
import crypto from "crypto";

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const HMAC_KEY = process.env.OTP_HMAC_KEY || "replace_with_strong_key";

// cryptographic OTP generator
export function generateNumericOtp(length = OTP_LENGTH) {
  // crypto.randomInt is secure; produce numeric string with leading zeros
  let otp = "";
  for (let i = 0; i < length; i++) otp += String(crypto.randomInt(0, 10));
  return otp;
}

export function hashOtp(otp: string) {
  return crypto.createHmac("sha256", HMAC_KEY).update(otp).digest("hex");
}
