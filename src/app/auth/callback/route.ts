import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  console.error("[AUTH CALLBACK] Route hit. Code present:", !!code);
  
  if (code) {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.redirect(new URL("/?error=config", origin));
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error("Error exchanging code for session:", error);
      return NextResponse.redirect(new URL("/?error=auth", origin));
    }

    // Check if email is whitelisted
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !user.email) {
      console.error("No user or email after authentication");
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/?error=noemail", origin));
    }

    // Check if email is whitelisted
    // Option 1: Environment variable (comma-separated emails) - takes priority
    const allowedEmailsEnv = process.env.ALLOWED_EMAILS?.split(",").map(e => e.trim().toLowerCase()).filter(e => e.length > 0) || [];
    
    console.error(`[AUTH CALLBACK] Checking email whitelist for: ${user.email}`);
    console.error(`[AUTH CALLBACK] ALLOWED_EMAILS env var: ${process.env.ALLOWED_EMAILS ? `SET (${process.env.ALLOWED_EMAILS})` : 'NOT SET'}`);
    console.error(`[AUTH CALLBACK] Parsed allowed emails: ${JSON.stringify(allowedEmailsEnv)}`);
    console.error(`[AUTH CALLBACK] USE_ALLOWED_USERS_TABLE: ${process.env.USE_ALLOWED_USERS_TABLE}`);
    
    // Option 2: Supabase table (if ALLOWED_EMAILS is not set, check database)
    let isAllowed = false;
    let whitelistConfigured = false;
    
    if (allowedEmailsEnv.length > 0) {
      // Use environment variable whitelist
      whitelistConfigured = true;
      const userEmail = user.email.toLowerCase();
      isAllowed = allowedEmailsEnv.includes(userEmail);
      console.error(`[AUTH CALLBACK] Email ${userEmail} ${isAllowed ? 'IS' : 'IS NOT'} in env whitelist`);
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
      console.log(`[AUTH] Email ${user.email} ${isAllowed ? 'IS' : 'IS NOT'} in allowed_users table`);
    } else {
      // No whitelist configured - allow all authenticated users (development mode)
      console.log("[AUTH] No whitelist configured - allowing all authenticated users (development mode)");
      isAllowed = true;
      whitelistConfigured = false;
    }
    
    // If whitelist is configured and user is not allowed, deny access
    if (whitelistConfigured && !isAllowed) {
      console.error(`[AUTH CALLBACK] ❌ Access DENIED for email: ${user.email}`);
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/?error=unauthorized", origin));
    }
    
    if (whitelistConfigured && isAllowed) {
      console.error(`[AUTH CALLBACK] ✅ Access GRANTED for email: ${user.email}`);
    }
  }

  // Redirect to home page after successful authentication
  return NextResponse.redirect(new URL("/", origin));
}


