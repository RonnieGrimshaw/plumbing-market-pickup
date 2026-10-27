# pick-up-app — Plumbing Market Pickup Verification

Custom Shopify app for **Plumbing Market** (plumbingmarket.ca).  
Phase 1 only: digital pickup receipt / signature + ID photo + certificate for LOCAL PICKUP orders.

**Build name:** pick-up-app  
**Status:** Phase 1 scaffold complete. Credentials and DNS collected.  
Ready for you to deploy the test instance (see `docs/DEPLOYMENT.md`).

## What this build contains
- Architecture and data model (order metafields, tags, notes, audit records)
- Customer mobile signing flow (confirm → consent+sign → ID photo → submit)
- Aircall SMS integration notes (messages/native/send + webhooks)
- Shopify POS Pickup Desk tile concept
- Pickup Certificate PDF template spec
- Draft legal / privacy / terms texts (flagged for your lawyer)
- Exact DNS records needed for pickup.plumbingmarket.ca
- Credentials checklist
- End-to-end test plan
- Phase 2 architecture notes (not implemented)

## Stack (confirmed — do not substitute)
- Shopify Admin API + order metafields / files / notes / tags
- Shopify POS (staff interface)
- Aircall (top plan) — `messages/native/send` + messaging webhooks
- Google Workspace domain for certificate emails
- Hosted signing page on subdomain of plumbingmarket.ca (DNS at Squarespace)

## Quick start for development / testing
1. Read `docs/ARCHITECTURE.md` and `docs/DNS-AND-CREDENTIALS.md`.
2. Create a Shopify development store and install the app in draft mode.
3. Supply Aircall API credentials and the subdomain DNS records (see docs).
4. Run the test plan in `docs/TEST-PLAN.md` with test orders only.
5. Approve results before any production enablement.

## Folder layout
```
pick-up-app/
├── app/           # Shopify app backend (Remix/Node scaffold)
├── web/           # Customer-facing signing page (mobile web)
├── extensions/    # POS UI extension notes / scaffold
├── docs/          # Architecture, DNS, legal drafts, test plan
└── scripts/       # Helper scripts (token generation, PDF stub, etc.)
```

## Hosting & cost estimate (Phase 1)
- Signing page + API: Vercel / Fly.io / Railway (free tier or ~$5–20/mo)
- Shopify Files storage: included with store plan
- Aircall: already on top plan (API sending included)
- Domain: subdomain of existing plumbingmarket.ca
- No paid third-party services required for Phase 1 beyond what you already have

## Next actions required from you
See `docs/DNS-AND-CREDENTIALS.md` for the exact list (Aircall keys, DNS records, Google Workspace sender, Shopify app install approval on dev store).

---

**Guardrail:** Theme and checkout changes are limited to optional pickup-person fields + ready-for-pickup notification link. All legal texts are drafts only.
