# Email Whitelist Setup

This application supports restricting access to only specific Google accounts. You can use either environment variables or a Supabase table.

## Option 1: Environment Variables (Recommended - Simpler)

Add this to your `.env.local` file:

```bash
# Comma-separated list of allowed email addresses
ALLOWED_EMAILS=your-email@gmail.com,another-email@gmail.com,third-email@gmail.com
```

**Pros:**
- Simple to set up
- No database changes needed
- Easy to update (just change env var and redeploy)

**Cons:**
- Requires code deployment to add/remove users
- Not ideal if you need to manage many users

## Option 2: Supabase Table (More Flexible)

1. Run the SQL script in Supabase SQL Editor:
   ```sql
   -- See create-allowed-users-table.sql
   ```

2. Add users to the `allowed_users` table:
   ```sql
   INSERT INTO allowed_users (email, name) VALUES 
     ('your-email@gmail.com', 'Your Name'),
     ('another-email@gmail.com', 'Another Name')
   ON CONFLICT (email) DO NOTHING;
   ```

3. Set environment variable to enable table-based whitelist:
   ```bash
   USE_ALLOWED_USERS_TABLE=true
   ```

**Pros:**
- Can add/remove users without code deployment
- Can manage users through Supabase dashboard
- Better for many users

**Cons:**
- Requires database setup
- Slightly more complex

## How It Works

1. User signs in with Google
2. After authentication, the system checks if their email is in the whitelist
3. If not whitelisted, they are signed out and shown an error message
4. If whitelisted, they can access the application

## Priority

- If `ALLOWED_EMAILS` environment variable is set, it takes priority
- If `ALLOWED_EMAILS` is not set but `USE_ALLOWED_USERS_TABLE=true`, the database table is checked
- If neither is configured, all authenticated users are allowed (development mode)

