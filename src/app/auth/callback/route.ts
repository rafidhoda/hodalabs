import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

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
    const allowedEmailsEnv = process.env.ALLOWED_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
    
    // Option 2: Supabase table (if ALLOWED_EMAILS is not set, check database)
    let isAllowed = false;
    
    if (allowedEmailsEnv.length > 0) {
      // Use environment variable whitelist
      const userEmail = user.email.toLowerCase();
      isAllowed = allowedEmailsEnv.includes(userEmail);
    } else if (process.env.USE_ALLOWED_USERS_TABLE === "true") {
      // Check Supabase table (optional - only if env var not set and flag is enabled)
      const { data: allowedUser, error: checkError } = await supabase
        .from("allowed_users")
        .select("email")
        .eq("email", user.email.toLowerCase())
        .single();
      
      if (checkError && checkError.code !== "PGRST116") { // PGRST116 = no rows found
        console.error("Error checking allowed_users table:", checkError);
        // If table doesn't exist or error, deny access for safety
        isAllowed = false;
      } else {
        isAllowed = !!allowedUser;
      }
    } else {
      // No whitelist configured - allow all authenticated users (development mode)
      isAllowed = true;
    }
    
    // If whitelist is configured and user is not allowed, deny access
    if (allowedEmailsEnv.length > 0 || process.env.USE_ALLOWED_USERS_TABLE === "true") {
      if (!isAllowed) {
        console.log(`Access denied for email: ${user.email}`);
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/?error=unauthorized", origin));
      }
    }
  }

  // Redirect to home page after successful authentication
  return NextResponse.redirect(new URL("/", origin));
}


