# Deployment Guide — pick-up-app (Test Instance)

All credentials and DNS are ready. Follow these steps to deploy the test instance.

## 1. Create the Shopify app (Partner dashboard)
1. Go to partners.shopify.com → Apps → Create app.
2. Name: `Plumbing Market Pickup Verification`.
3. App URL (temporary): `https://pickup.plumbingmarket.ca` (or a Vercel preview URL).
4. Allowed redirection URL(s): `https://pickup.plumbingmarket.ca/auth/callback`
5. Install the app on `plumbing-market-pickup.myshopify.com` in **test mode**.

## 2. Host the signing page + API
Recommended: Vercel (free tier).

1. Push the `pick-up-app` folder to a GitHub repo.
2. Import into Vercel.
3. Add environment variables:
   - `AIRCALL_API_ID=C4b61b44674d18406d6d068ab0716d1f`
   - `AIRCALL_API_TOKEN=02761309342d682ea3b975e977ef0adc`
   - `AIRCALL_NUMBER_ID=775344`
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=587`
   - `SMTP_USER=info@plumbingmarket.ca`
   - `SMTP_PASS=qyap gctt ggrd llxd`
   - `SHOPIFY_API_KEY=...` (from Partner dashboard)
   - `SHOPIFY_API_SECRET=...`
   - `SHOPIFY_STORE=plumbing-market-pickup.myshopify.com`
4. Custom domain: `pickup.plumbingmarket.ca` (CNAME already points to Vercel).
5. Add any Vercel verification TXT if prompted.

## 3. Aircall webhook
Once the app is live, set the messaging webhook URL to:
`https://pickup.plumbingmarket.ca/api/webhooks/aircall`

## 4. Test orders
Create LOCAL PICKUP test orders only on the development store. Never enable on the live plumbingmarket.ca store until you approve results.

## Cost (Phase 1 test)
- Vercel: $0 (hobby)
- Shopify development store: $0
- Aircall: existing plan
- Google Workspace: existing
- Total additional: $0
