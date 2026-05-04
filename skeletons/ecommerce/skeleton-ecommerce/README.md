# E-commerce Marketplace Skeleton

Production-grade React + TypeScript skeleton for shopping / marketplace products.

## Layout

5 bottom tabs: Shop · Search · Saved (with count) · Bag (with count) · Account.

## Pages

- **Home** — hero + curated rows ("Just landed", "Popular this week")
- **Search** — search input + filter Sheet (category + price band) + sort + product grid
- **ProductDetail** — image gallery + variants + add-to-cart bar + free-shipping hint + reviews
- **Cart** — line items with quantity stepper, free-shipping progress bar, subtotal, checkout CTA
- **Checkout** — 3-step flow: Address → Payment → Review with animated transitions
- **Wishlist** — saved items grid
- **Account** — guest header, sections (Orders, Addresses, Payment, Help), theme picker

## What's wired

- `useCart` — persisted cart with quantity + variant tracking, hydrates lines from catalog, computes itemCount + subtotal
- `useWishlist` — persisted product-id set with toggle
- Free-shipping threshold from `APP_CONFIG.freeShippingThreshold` shown on PDP and Cart
- Currency formatting via `Intl.NumberFormat`, locale-aware
- Cart count badge on bag tab updates optimistically when items are added
- All 11 UI primitives + 6 domain components

## Running

```bash
npm install
npm run dev
npm run typecheck
npm run validate
npm run build
```

## Customization

1. Edit `src/config/app.ts` — name, currency, freeShippingThreshold.
2. Replace `src/data/seed.ts` with real catalog from your CMS / commerce backend.
3. Replace gradient placeholders in `ProductImage` with `<img src={...} />`.
4. Wire checkout payment to a real processor (Stripe Elements, etc.).
