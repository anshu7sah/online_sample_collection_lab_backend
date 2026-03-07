import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}) {
  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || "Lab App"}" <${process.env.EMAIL_USER}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}
