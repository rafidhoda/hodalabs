import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = getSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Redirect to home page after successful authentication
  return NextResponse.redirect(new URL("/", requestUrl.origin));
}

