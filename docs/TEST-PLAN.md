# End-to-End Test Plan (Phase 1 — test/draft only)

**Nothing touches live customer orders until you approve these results.**

## Prerequisites
- Shopify development store with the app installed in draft
- Aircall credentials configured
- Test phone number that can receive SMS
- Google Workspace sender configured
- Subdomain pointing at test host

## Test scenarios

### 1. Staging photos
- Create test LOCAL PICKUP order
- Upload two photos (box condition + label) via staff flow
- Confirm they appear as order metafields and in Shopify Files

### 2. Ready → link generation
- Mark order ready
- Confirm secure link generated (14-day expiry)
- Confirm Aircall SMS sent via `messages/native/send` (visible in Aircall app)
- Confirm email also sent
- Confirm QR code available for counter

### 3. Customer signing flow (self)
- Open link on real phone
- Confirm order number + full item list visible before signing
- Edit pickup person name/role
- Accept consent (version stored)
- Draw signature (empty check works)
- Capture ID photo (preview + retake)
- Submit → success screen
- Confirm link becomes view-only

### 4. Third-party pickup
- Name a different person + mobile at checkout or via “Who’s picking up?”
- Confirm SMS goes to that phone
- Complete signing as third party
- Confirm authorization logged

### 5. Batch pickup
- One person collects two test orders
- Single signing session lists both
- Separate certificate generated per order

### 6. Staff override
- Customer refuses ID photo
- Staff completes override with their own name
- Confirm override is logged and visible

### 7. POS release
- In Shopify POS, see colour status
- View signature beside ID photo
- Scan barcode / complete pickup
- Confirm staff member and timestamp recorded
- Confirm order fulfilled

### 8. Certificate & notifications
- Pickup Certificate PDF generated with frozen items, hashes, signature
- Emailed to buyer
- Aircall SMS: “Order #[x] was picked up by [name] at [time]”
- “Download evidence” action works (owner only)

### 9. 48-hour inspection window
- Confirm deadline shown on certificate and receipt
- Submit a test report with photo
- Confirm appended to audit record
- (Optional) let window expire and confirm auto-close message

### 10. Reissue & expiry
- Reissue link → old token revoked
- Confirm 14-day expiry behaviour

## Reporting back
After tests I will provide:
- What was built
- Where the app is hosted and estimated cost
- Exact DNS records and remaining credentials
- Screenshots / results of every test above

**Stop here until you approve.**
