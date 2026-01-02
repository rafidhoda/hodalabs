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

    // Check if email is whitelisted
    // Option 1: Environment variable (comma-separated emails) - takes priority
    const allowedEmailsEnv = process.env.ALLOWED_EMAILS?.split(",").map(e => e.trim().toLowerCase()).filter(e => e.length > 0) || [];
    
    let isAllowed = false;
    let whitelistConfigured = false;
    
    if (allowedEmailsEnv.length > 0) {
      // Use environment variable whitelist
      whitelistConfigured = true;
      const userEmail = user.email.toLowerCase();
      isAllowed = allowedEmailsEnv.includes(userEmail);
    } else if (process.env.USE_ALLOWED_USERS_TABLE === "true") {
      // Check Supabase table (optional - only if env var not set and flag is enabled)
      whitelistConfigured = true;
      const { data: allowedUser, error: checkError } = await supabase
        .from("allowed_users")
        .select("email")
        .eq("email", user.email.toLowerCase())
        .single();
      
      if (checkError && checkError.code !== "PGRST116") { // PGRST116 = no rows found
        console.error("[AUTH] Error checking allowed_users table:", checkError);
        // If table doesn't exist or error, deny access for safety
        isAllowed = false;
      } else {
        isAllowed = !!allowedUser;
      }
    } else {
      // No whitelist configured - allow all authenticated users (development mode)
      isAllowed = true;
      whitelistConfigured = false;
    }
    
    return NextResponse.json({
      allowed: isAllowed,
      whitelistConfigured,
      email: user.email,
    });
  } catch (error) {
    console.error("[AUTH] Error checking authorization:", error);
    return NextResponse.json({ allowed: false, reason: "error" }, { status: 500 });
  }
}

