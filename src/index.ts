import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import authRouter from "./routes/auth";
import testRouter from "./routes/test/test";
import packageRouter from "./routes/package/package"
import cookieParser from "cookie-parser";
import fileRouter from "./routes/filehandling";


const app = express();

// ===== Middlewares =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


// Security Middlewares
app.use(helmet()); // Secure HTTP headers
const allowedOrigins = [
  "http://localhost:3000",
  "https://admin.yourdomain.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100, // Limit each IP
  message: "Too many requests from this IP, please try again later.",
});

// Logger
app.use(morgan("dev"));

app.use("/api/auth", authRouter);
app.use("/api/tests", testRouter);
app.use("/api/packages", packageRouter);
app.use("/api/filehandling", fileRouter);

// ===== Routes =====
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "API is running 🚀" });
});

// ===== 404 Handler =====
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    status: "fail",
    message: `Route ${req.originalUrl} not found`,
  });
});

// ===== Global Error Handler =====
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("🔥 Error:", err);

  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ===== Start Server =====
const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, "0.0.0.0",() => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
