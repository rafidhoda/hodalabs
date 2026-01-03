import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Configuration error" }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user || !user.email) {
      return NextResponse.json({ allowed: false, reason: "not_authenticated" });
    }

    // Check if email is whitelisted (hardcoded whitelist)
    const allowedEmails = ["rafidhoda@gmail.com"];
    const userEmail = user.email.toLowerCase();
    const isAllowed = allowedEmails.includes(userEmail);
    
    console.error(`[AUTH CHECK] User: ${user.email}, Allowed: ${isAllowed}`);
    
    return NextResponse.json({
      allowed: isAllowed,
      whitelistConfigured: true,
      email: user.email,
    });
  } catch (error) {
    console.error("[AUTH] Error checking authorization:", error);
    return NextResponse.json({ allowed: false, reason: "error" }, { status: 500 });
  }
}

