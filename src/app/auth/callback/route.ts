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

    // Check if email is whitelisted (hardcoded whitelist)
    const allowedEmails = ["rafidhoda@gmail.com"];
    const userEmail = user.email.toLowerCase();
    const isAllowed = allowedEmails.includes(userEmail);
    
    console.error(`[AUTH CALLBACK] Checking email: ${user.email}`);
    console.error(`[AUTH CALLBACK] Allowed emails: ${JSON.stringify(allowedEmails)}`);
    console.error(`[AUTH CALLBACK] Is allowed: ${isAllowed}`);
    
    if (!isAllowed) {
      console.error(`[AUTH CALLBACK] ❌ Access DENIED for email: ${user.email}`);
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/?error=unauthorized", origin));
    }
    
    console.error(`[AUTH CALLBACK] ✅ Access GRANTED for email: ${user.email}`);
  }

  // Redirect to home page after successful authentication
  return NextResponse.redirect(new URL("/", origin));
}


