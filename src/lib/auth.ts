import { createClient } from "@supabase/supabase-js";

/**
 * Check if a user's email is in the allowed whitelist
 * Returns true if whitelist is not configured (development mode)
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  // Option 1: Environment variable (comma-separated emails) - takes priority
  const allowedEmailsEnv = process.env.ALLOWED_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  
  if (allowedEmailsEnv.length > 0) {
    return allowedEmailsEnv.includes(email.toLowerCase());
  }
  
  // Option 2: Supabase table (if ALLOWED_EMAILS is not set, check database)
  if (process.env.USE_ALLOWED_USERS_TABLE === "true") {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase credentials missing for allowed_users check");
      return false; // Deny access if we can't check
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    const { data: allowedUser, error: checkError } = await supabase
      .from("allowed_users")
      .select("email")
      .eq("email", email.toLowerCase())
      .single();
    
    if (checkError && checkError.code !== "PGRST116") { // PGRST116 = no rows found
      console.error("Error checking allowed_users table:", checkError);
      return false; // Deny access on error
    }
    
    return !!allowedUser;
  }
  
  // No whitelist configured - allow all (development mode)
  return true;
}

