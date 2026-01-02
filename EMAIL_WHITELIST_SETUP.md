# Email Whitelist Setup

This application supports restricting access to only specific Google accounts. You can use either environment variables or a Supabase table.

## Option 1: Environment Variables (Recommended - Simpler)

### Local Development

Add this to your `.env.local` file:

```bash
# Comma-separated list of allowed email addresses
ALLOWED_EMAILS=your-email@gmail.com,another-email@gmail.com,third-email@gmail.com
```

### Production Deployment

**⚠️ IMPORTANT: You MUST also set this environment variable in your deployment platform!**

The environment variable in `.env.local` only works locally. For production, you need to set it in your deployment platform:

#### Vercel
1. Go to your project in [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your project → **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name:** `ALLOWED_EMAILS`
   - **Value:** `your-email@gmail.com,another-email@gmail.com`
   - **Environment:** Production (and optionally Preview/Development)
4. **Redeploy** your application (or push a new commit to trigger a new deployment)

#### Netlify
1. Go to your site in [Netlify Dashboard](https://app.netlify.com/)
2. Click **Site configuration** → **Environment variables**
3. Click **Add a variable**
4. Add:
   - **Key:** `ALLOWED_EMAILS`
   - **Value:** `your-email@gmail.com,another-email@gmail.com`
5. **Redeploy** your site

#### Other Platforms
Set the `ALLOWED_EMAILS` environment variable in your platform's environment variable settings, then redeploy.

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

