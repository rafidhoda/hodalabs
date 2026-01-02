import { NextResponse } from "next/server";

export async function GET() {
  // This endpoint is just for debugging - remove it after confirming env var works
  const allowedEmails = process.env.ALLOWED_EMAILS;
  
  return NextResponse.json({
    ALLOWED_EMAILS: allowedEmails || "NOT SET",
    isSet: !!allowedEmails,
    length: allowedEmails?.length || 0,
    parsed: allowedEmails?.split(",").map(e => e.trim()) || [],
    // Only show first 10 chars for security
    preview: allowedEmails ? `${allowedEmails.substring(0, 10)}...` : "NOT SET",
  });
}

