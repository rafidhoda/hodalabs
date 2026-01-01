# Zapier Integration Guide

This guide explains how to connect any data source to Hoda Labs using Zapier webhooks.

## How It Works

Zapier acts as a bridge between external services (Stripe, email, social media, etc.) and your Hoda Labs app. When something happens in an external service, Zapier sends the data to your webhook endpoint, which then stores it in your database.

## Step 1: Create a Zap in Zapier

1. Go to [Zapier.com](https://zapier.com) and create a new Zap
2. Choose your **Trigger** (the event that starts the Zap):
   - **Stripe**: "New Payment"
   - **Gmail**: "New Email"
   - **Google Sheets**: "New Row"
   - **Twitter/X**: "New Tweet"
   - Or any other service Zapier supports

3. Connect your account and configure the trigger

## Step 2: Add Webhook Action

1. Click **"+ Action"** to add a new step
2. Search for and select **"Webhooks by Zapier"**
3. Choose **"POST"** as the action event

## Step 3: Configure the Webhook

### URL
```
https://www.hodalabs.co/api/webhooks/zapier
```
*(For local testing, use: `http://localhost:3000/api/webhooks/zapier`)*

### Payload Type
Select **"Json"** (not Form)

### Data Mapping
Map the fields from your trigger to the webhook. The webhook endpoint will automatically detect and handle different data types:

#### For Stripe Transactions (Already Set Up)
The webhook automatically detects Stripe transactions if you send:
- `id` or `payment_intent_id` → Will be used as `stripe_payment_id`
- `amount` → Payment amount
- `currency` → Currency code (e.g., "nok", "usd")

These are saved to the `transactions` table.

#### For Other Data Sources
For any other data source, send fields like:
- `source` - The name of the source (e.g., "gmail", "twitter", "stripe")
- `title` - Main title/headline
- `content` or `message` - Description/body text
- `url` or `link` - Related URL
- `author` - Author/sender name
- `email` - Email address
- `image_url` - Image URL
- Any other fields you want to include

**Note:** The webhook is flexible and will try to extract common fields from various field names (see examples below).

## Step 4: Test and Publish

1. Click **"Test"** to send a test webhook
2. Check that you get a success response
3. Verify the data appears in your app
4. Click **"Publish"** to activate the Zap

## Examples

### Example 1: Gmail - New Email

**Trigger:** Gmail → "New Email"

**Webhook Data:**
```json
{
  "source": "gmail",
  "title": "{{From Name}} - {{Subject}}",
  "content": "{{Body Plain}}",
  "author": "{{From Name}}",
  "author_email": "{{From Email}}",
  "url": "{{Email Link}}",
  "created_at": "{{Date}}"
}
```

### Example 2: Twitter/X - New Tweet

**Trigger:** Twitter → "New Tweet"

**Webhook Data:**
```json
{
  "source": "twitter",
  "title": "New Tweet from {{Username}}",
  "content": "{{Text}}",
  "author": "{{Username}}",
  "url": "{{Tweet Link}}",
  "image_url": "{{Media URL}}",
  "created_at": "{{Created At}}"
}
```

### Example 3: Google Sheets - New Row

**Trigger:** Google Sheets → "New Row"

**Webhook Data:**
```json
{
  "source": "google_sheets",
  "title": "{{Column A}}",
  "content": "{{Column B}}",
  "author": "{{Column C}}",
  "created_at": "{{Timestamp}}"
}
```

### Example 4: Slack - New Message

**Trigger:** Slack → "New Message in Channel"

**Webhook Data:**
```json
{
  "source": "slack",
  "title": "New message in {{Channel Name}}",
  "content": "{{Message Text}}",
  "author": "{{User Name}}",
  "url": "{{Message Link}}",
  "created_at": "{{Timestamp}}"
}
```

## Field Name Flexibility

The webhook endpoint automatically looks for data in multiple field names:

- **Title:** `title`, `subject`, `name`
- **Content:** `content`, `message`, `description`, `text`, `body`
- **URL:** `url`, `link`, `permalink`
- **Image:** `image_url`, `image`, `thumbnail`
- **Author:** `author`, `from`, `user`, `sender`, `username`
- **Email:** `author_email`, `email`, `from_email`
- **Avatar:** `author_avatar`, `avatar`, `profile_picture`

So if your service uses different field names, the webhook will still work!

## Security (Optional)

If you want to add security to your webhooks:

1. Add an environment variable in your `.env.local`:
   ```
   ZAPIER_WEBHOOK_SECRET=your_secret_here
   ```

2. In Zapier, add a header to your webhook:
   - **Header Name:** `x-webhook-secret`
   - **Header Value:** `your_secret_here`

This ensures only requests with the correct secret are accepted.

## Troubleshooting

### Webhook Returns 405 Error
- Make sure the URL is correct
- Ensure you selected "POST" as the action type
- Check that your app is deployed/running

### Data Not Appearing
- Check the webhook test response for errors
- Verify the data format matches what the endpoint expects
- Check your browser console for any client-side errors
- Verify you're logged in to the app

### Transactions Not Showing
- Stripe transactions require: `id` (or `payment_intent_id`), `amount`, and `currency`
- Make sure these fields are mapped correctly in Zapier
- Check that the `transactions` table exists in Supabase

## Current Setup

- ✅ **Stripe Payments** - Automatically saved to `transactions` table and displayed in feed
- ⚠️ **Other Sources** - Currently, only Stripe transactions are displayed. To add other sources, we'll need to create additional tables or extend the feed functionality.

## Next Steps

To add support for other data sources in the feed:
1. Create a table for the new data type (if needed)
2. Update the webhook endpoint to handle the new data type
3. Update the feed page to display the new data type

For now, focus on getting data into the system via webhooks, and we can build the display functionality as needed.

