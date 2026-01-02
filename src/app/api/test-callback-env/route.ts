import { NextResponse } from "next/server";

export async function GET() {
  // This mimics exactly what the callback route does
  const allowedEmailsEnv = process.env.ALLOWED_EMAILS?.split(",").map(e => e.trim().toLowerCase()).filter(e => e.length > 0) || [];
  
  const testEmail = "hodacamps@gmail.com";
  const testEmail2 = "rafidhoda@gmail.com";
  
  let whitelistConfigured = allowedEmailsEnv.length > 0;
  let isAllowed1 = whitelistConfigured && allowedEmailsEnv.includes(testEmail.toLowerCase());
  let isAllowed2 = whitelistConfigured && allowedEmailsEnv.includes(testEmail2.toLowerCase());
  
  return NextResponse.json({
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS || "NOT SET",
    allowedEmailsEnv,
    whitelistConfigured,
    test: {
      email: testEmail,
      isAllowed: isAllowed1,
      shouldBeBlocked: !isAllowed1 && whitelistConfigured,
    },
    test2: {
      email: testEmail2,
      isAllowed: isAllowed2,
      shouldBeBlocked: !isAllowed2 && whitelistConfigured,
    },
  });
}

