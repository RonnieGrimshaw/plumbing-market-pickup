# Architecture — pick-up-app (Phase 1)

## High-level flow
1. Order is staged → staff takes 2 photos (box condition + label) → uploaded to Shopify Files + order metafields.
2. Staff marks order ready for pickup → system generates secure token (14-day expiry), sends Aircall SMS + email with link (or QR for counter).
3. Customer (or named third-party) opens link on phone → confirm items → consent + signature → ID photo → submit.
4. On submit: audit record written, SHA-256 hashes stored, files attached as order metafields, note + tag `pickup-verified` added, Pickup Certificate PDF generated and emailed, SMS notification sent.
5. Staff in Shopify POS sees status, compares signature to ID, scans items, records who released the goods, fulfills order.
6. 48-hour inspection window starts; report form available; auto-close if no report.

## Data stored on the Shopify order
| Field | Type | Purpose |
|-------|------|---------|
| `pickup.token` | single-line text | Current secure token (revoked on reissue) |
| `pickup.token_expires` | date | 14 days from generation |
| `pickup.status` | single-line text | awaiting / verified / override / expired |
| `pickup.signature_file` | file_reference | Signature image |
| `pickup.id_photo_file` | file_reference | Government ID photo |
| `pickup.certificate_file` | file_reference | Pickup Certificate PDF |
| `pickup.audit_json` | json | Full audit record (see below) |
| `pickup.staging_photos` | list.file_reference | Two staging photos |
| `pickup.legal_hold` | boolean | Exempt from future 3-year deletion |
| `pickup.retention_date` | date | pickup_date + 3 years |
| `pickup.third_party_name` | single-line text | Named pickup person |
| `pickup.third_party_phone` | single-line text | Their mobile |

**Order note** (appended):  
`Pickup verified — signed by [name], [YYYY-MM-DD HH:MM America/Toronto]. ID on file.`

**Tag:** `pickup-verified`

## Audit record (stored in `pickup.audit_json`)
```json
{
  "order_number": "1234",
  "buyer_name": "...",
  "pickup_person_name": "...",
  "pickup_person_role": "self|employee|contractor|family",
  "company_name": "...",
  "consent_version": "v1.0-2026-10-26",
  "consent_accepted_at": "ISO-8601",
  "submitted_at": "ISO-8601 America/Toronto",
  "ip_address": "...",
  "user_agent": "...",
  "delivery_channel": "sms|email|qr",
  "aircall_message_id": "...",
  "aircall_delivery_status": "delivered|failed|...",
  "signature_sha256": "...",
  "id_photo_sha256": "...",
  "staff_override": false,
  "staff_override_by": null,
  "inspection_deadline": "ISO-8601",
  "inspection_report": null
}
```

## Token security
- Cryptographically random, single-use for signing, becomes view-only after completion.
- Reissuing revokes previous token.
- 14-day expiry.
- Bound to one order ID.

## Aircall integration
- Use **messages/native/send** (so messages appear in Aircall apps).
- Configure messaging webhooks → log delivery status into audit record.
- Texts are purely transactional (pickup only).
- From the store’s main Aircall number.

## 48-hour inspection window
- Starts at pickup completion.
- Report link printed on certificate and emailed.
- One reminder at ~24 h remaining.
- If no report by deadline → append “Inspection window closed [datetime] — no damage reported.”

## Retention
- Signature, ID photo, certificate retained 3 years from pickup date.
- `legal_hold` flag prevents deletion (deletion job is Phase 2).
- Files live only in Shopify Files.
- Access controls: only pickup-duty staff can view ID photos; only owner role can download evidence package or delete.

## POS Pickup Desk
- Tile showing today’s pickups with colour status (red = awaiting signature, green = verified).
- Forced sequence: cannot complete without signature or logged staff override.
- Side-by-side signature + ID photo.
- “Complete pickup” action records staff member (their own login), time, barcode scan, then fulfills.
- Batch support: one signing session → separate certificate per order.
- Aging list: ready ≥ 30 days; 11-month heads-up; 1-year flag for conversion (owner approval required).

## Phase 2 (architected, not built)
- Automatic 3-year deletion job with legal-hold exemption
- Partial pickups / per-trip mini-certificate
- Standing authorized-employee lists
- Reporting dashboard
- ID blur detection + Ontario licence barcode (PDF417) matching
- Optional item-condition photo at handover
- Language toggle
- Timeline comment posting (if Shopify enables it for apps)
