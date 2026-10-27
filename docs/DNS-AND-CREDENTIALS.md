# DNS Records & Credentials Needed

## DNS (Squarespace) — for pickup.plumbingmarket.ca
Add these records exactly. I will not create any paid services; you control DNS and accounts.

| Type | Host | Value | TTL | Notes |
|------|------|-------|-----|-------|
| CNAME | pickup | cname.vercel-dns.com (or your host’s CNAME) | 3600 | Points subdomain to the signing-page host |
| TXT | pickup | vercel-verification=... (or host verification) | 3600 | Domain ownership verification (provided after you choose host) |

**Recommended host for Phase 1:** Vercel (free tier sufficient for testing).  
After you add the CNAME, tell me and I will give you the exact verification TXT if needed.

Alternative: Cloudflare or any host that supports custom domains. DNS stays at Squarespace.

## Credentials & accounts I need from you
Please create or provide the following (do not share production secrets in plain chat if possible; use secure methods):

1. **Aircall**
   - API ID + API Token (or OAuth credentials) with permission for `messages/native/send`
   - Main number ID that texts will come from
   - Webhook URL you will configure (I will give you the endpoint once the app is deployed to a test host)

2. **Shopify**
   - Development store (or draft app install on a non-live store)
   - App installation approval so I can use Admin API (orders, metafields, files, tags, notes)
   - POS channel enabled

3. **Google Workspace**
   - Sender email address on plumbingmarket.ca domain (e.g. pickup@plumbingmarket.ca or noreply@...)
   - SMTP credentials or App Password (or Google API service account if preferred)

4. **Subdomain**
   - Confirmation that you have added the CNAME above
   - Any existing SSL / hosting preference

## What I will not do
- Sign up for any paid services myself
- Enable anything on live customer orders
- Change theme or checkout beyond the optional pickup-person fields and notification link
- Publish legal texts (drafts only)

## Once you supply the above
I can deploy a test instance, run the full flow with test orders, and return screenshots + results.
