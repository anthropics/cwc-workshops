# Bill Splitter v1 Spec

## Audience
Restaurant diners settling up at the table. The person paying works out what each person owes.

## Product
A stateless, mobile-first PWA calculator. No accounts, no backend, no persistence, no sharing.

## Inputs
1. **Bill total**, post-tax, in a single field.
2. **Tip**: presets of 15, 18, 20 and 25%, plus a custom percentage. Calculated on the post-tax total.
3. **Headcount**: number of people, no names.

## Output
Per-person amount, split evenly, with each share rounded up to the next cent. The payer collects a few extra cents.

## Success metric
A result in under 10 seconds from opening the app.

## Out of scope for v1
- Itemized or custom splits
- Names or saved people
- Payment links (Venmo, Cash App, etc.)
- Saved history
- Shareable links
- Receipt scanning

## Open items
- **Currency and locale:** USD only, or use the device locale?
- **Empty total:** What to show when the bill is zero or empty.
- **Offline support:** Is a service worker needed for v1? Not selected.
- **Tip base:** Tip on the post-tax total overtips slightly by convention. Accept it, or add a v2 toggle?
- **Round-up:** Confirm that rounding each share up to the next cent is deliberate, since the payer collects slightly more than the bill.
