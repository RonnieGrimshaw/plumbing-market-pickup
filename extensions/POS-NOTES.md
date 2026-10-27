# Shopify POS Extension Notes (Phase 1)

The staff interface lives inside Shopify POS.

## Pickup Desk tile
- Shows today’s LOCAL PICKUP orders
- Colour status:
  - Red = awaiting signature
  - Yellow = signature received, awaiting staff release
  - Green = verified & completed
- Tap order → detail view

## Detail view
- Order number + items
- Signature image **beside** ID photo (for visual comparison)
- Staging photos
- Audit summary
- Actions:
  - Generate / reissue QR / link
  - Staff override (logs staff name)
  - Complete pickup (records staff login, time, optional barcode scan, then fulfills order)

## Constraints
- No shared logins — uses the staff member’s own Shopify/POS identity
- Cannot complete without signature or logged override
- Owner-only: Download evidence package

Implementation: Shopify POS UI extension (React) calling the app’s backend for status and actions.
Scaffold can be generated once the app is installed on a development store.
