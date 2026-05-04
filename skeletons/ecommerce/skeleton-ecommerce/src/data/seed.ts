import type { Product, Review } from './types';

/* SEED: 12 products. Replace with real catalog. Image keys reference
   gradient placeholders in pages; agent swaps for real CDN URLs. */

export const SEED_CATEGORIES: readonly string[] = [
  'all',
  'home',
  'kitchen',
  'tech',
  'apparel',
  'outdoor',
  'paper',
] as const;

export const SEED_PRODUCTS: readonly Product[] = [
  {
    id: 'p-1', title: 'Linen pillow cover',  vendor: 'NorthBeam', price: 42, compareAtPrice: 58,
    rating: 4.8, reviewCount: 312, category: 'home',
    description: 'Soft, pre-washed linen with a hidden zipper. Pairs well with everything; ages even better.',
    imageKeys: ['gradient-1', 'gradient-2', 'gradient-3'],
    variants: [
      { id: 'p-1-v1', label: 'Olive',  inStock: true },
      { id: 'p-1-v2', label: 'Stone',  inStock: true },
      { id: 'p-1-v3', label: 'Cream',  inStock: false },
    ],
    tags: ['linen', 'home', 'bedding'], isNew: false,
  },
  {
    id: 'p-2', title: 'Walnut chopping board', vendor: 'Ridgeline', price: 89,
    rating: 4.9, reviewCount: 1240, category: 'kitchen',
    description: 'A heavy, end-grain walnut board, finished with food-safe oil. Made for daily use.',
    imageKeys: ['gradient-2', 'gradient-1'],
    variants: [
      { id: 'p-2-v1', label: 'Medium', inStock: true },
      { id: 'p-2-v2', label: 'Large',  inStock: true },
    ],
    tags: ['kitchen', 'wood'], isNew: true,
  },
  {
    id: 'p-3', title: 'Wool throw blanket', vendor: 'NorthBeam', price: 128,
    rating: 4.7, reviewCount: 198, category: 'home',
    description: 'Warm without weight. Hand-finished edges, generous size.',
    imageKeys: ['gradient-3'],
    variants: [
      { id: 'p-3-v1', label: 'Charcoal', inStock: true },
      { id: 'p-3-v2', label: 'Camel',    inStock: true },
    ],
    tags: ['wool', 'home', 'textiles'],
  },
  {
    id: 'p-4', title: 'Mechanical keyboard', vendor: 'Pebble', price: 215, compareAtPrice: 249,
    rating: 4.6, reviewCount: 552, category: 'tech',
    description: 'Compact 65% layout, hot-swap sockets, lubed switches out of the box.',
    imageKeys: ['gradient-1', 'gradient-2'],
    variants: [
      { id: 'p-4-v1', label: 'Tactile',  inStock: true },
      { id: 'p-4-v2', label: 'Linear',   inStock: true },
      { id: 'p-4-v3', label: 'Clicky',   inStock: false },
    ],
    tags: ['tech', 'keyboard'], isNew: true,
  },
  {
    id: 'p-5', title: 'Heavyweight tee', vendor: 'Foundry', price: 38,
    rating: 4.5, reviewCount: 884, category: 'apparel',
    description: '8oz cotton, garment-dyed, boxy fit. Gets better with every wash.',
    imageKeys: ['gradient-2'],
    variants: [
      { id: 'p-5-v1', label: 'S', inStock: true },
      { id: 'p-5-v2', label: 'M', inStock: true },
      { id: 'p-5-v3', label: 'L', inStock: true },
      { id: 'p-5-v4', label: 'XL', inStock: false },
    ],
    tags: ['apparel', 'tee'],
  },
  {
    id: 'p-6', title: 'Insulated water bottle', vendor: 'Tide', price: 34,
    rating: 4.8, reviewCount: 2104, category: 'outdoor',
    description: '24oz, double-walled, holds temperature for 18 hours. Powder-coated finish.',
    imageKeys: ['gradient-3', 'gradient-1'],
    variants: [
      { id: 'p-6-v1', label: 'Sage',  inStock: true },
      { id: 'p-6-v2', label: 'Clay',  inStock: true },
      { id: 'p-6-v3', label: 'Slate', inStock: true },
    ],
    tags: ['outdoor', 'bottle'],
  },
  {
    id: 'p-7', title: 'Notebook, dot grid', vendor: 'Cordial', price: 18,
    rating: 4.7, reviewCount: 614, category: 'paper',
    description: 'Lay-flat binding, 90gsm fountain-pen-friendly paper, 192 pages.',
    imageKeys: ['gradient-1'],
    variants: [
      { id: 'p-7-v1', label: 'A5', inStock: true },
      { id: 'p-7-v2', label: 'B5', inStock: true },
    ],
    tags: ['paper', 'notebook'],
  },
  {
    id: 'p-8', title: 'Cast iron skillet, 10"', vendor: 'Ridgeline', price: 64,
    rating: 4.9, reviewCount: 1840, category: 'kitchen',
    description: 'Pre-seasoned, ready to use. The kind of pan you hand down.',
    imageKeys: ['gradient-2'],
    variants: [{ id: 'p-8-v1', label: '10 inch', inStock: true }],
    tags: ['kitchen', 'cookware'],
  },
  {
    id: 'p-9', title: 'Ceramic mug', vendor: 'NorthBeam', price: 24,
    rating: 4.6, reviewCount: 423, category: 'kitchen',
    description: 'Heavy bottom, comfortable handle. Microwave and dishwasher safe.',
    imageKeys: ['gradient-3'],
    variants: [
      { id: 'p-9-v1', label: 'Cream', inStock: true },
      { id: 'p-9-v2', label: 'Slate', inStock: true },
      { id: 'p-9-v3', label: 'Moss',  inStock: true },
    ],
    tags: ['kitchen', 'ceramic'],
  },
  {
    id: 'p-10', title: 'Canvas tote', vendor: 'Foundry', price: 52,
    rating: 4.7, reviewCount: 287, category: 'apparel',
    description: 'Heavy 16oz canvas, leather handles, deep enough for groceries.',
    imageKeys: ['gradient-1', 'gradient-3'],
    variants: [
      { id: 'p-10-v1', label: 'Natural', inStock: true },
      { id: 'p-10-v2', label: 'Black',   inStock: true },
    ],
    tags: ['apparel', 'bag'], isNew: true,
  },
  {
    id: 'p-11', title: 'Wireless earbuds', vendor: 'Pebble', price: 169,
    rating: 4.4, reviewCount: 932, category: 'tech',
    description: 'Active noise cancellation, 8 hours per charge, custom EQ.',
    imageKeys: ['gradient-2'],
    variants: [
      { id: 'p-11-v1', label: 'Charcoal', inStock: true },
      { id: 'p-11-v2', label: 'Cream',    inStock: false },
    ],
    tags: ['tech', 'audio'],
  },
  {
    id: 'p-12', title: 'Hiking daypack 22L', vendor: 'Tide', price: 96,
    rating: 4.8, reviewCount: 510, category: 'outdoor',
    description: 'Padded straps, hydration sleeve, ripstop nylon. Worn-in look from day one.',
    imageKeys: ['gradient-3', 'gradient-1', 'gradient-2'],
    variants: [
      { id: 'p-12-v1', label: 'Sage',  inStock: true },
      { id: 'p-12-v2', label: 'Stone', inStock: true },
    ],
    tags: ['outdoor', 'bag'],
  },
] as const;

export const SEED_REVIEWS: readonly Review[] = [
  { id: 'r-1', productId: 'p-1', author: 'Maya C.',   rating: 5, title: 'Better than expected',  body: 'Linen feels broken-in already. Color is true to the photos.',                createdAt: '2026-04-22T10:00:00Z' },
  { id: 'r-2', productId: 'p-1', author: 'Lena V.',   rating: 4, title: 'Lovely, runs slightly small', body: 'Ordered the medium and it fits a 20" insert snugly.',                  createdAt: '2026-04-15T11:30:00Z' },
  { id: 'r-3', productId: 'p-2', author: 'James O.',  rating: 5, title: 'Heirloom quality',      body: 'Heavy and beautiful. The end-grain pattern is gorgeous.',                    createdAt: '2026-04-19T15:00:00Z' },
  { id: 'r-4', productId: 'p-2', author: 'Aiko T.',   rating: 5, title: 'Worth every dollar',    body: 'Holds up to daily use. Just oil it occasionally.',                           createdAt: '2026-04-18T09:30:00Z' },
  { id: 'r-5', productId: 'p-4', author: 'Rohan P.',  rating: 5, title: 'Typing dream',          body: 'Switches feel fantastic. Build is solid. The case is a real chunk of metal.', createdAt: '2026-04-25T14:00:00Z' },
  { id: 'r-6', productId: 'p-4', author: 'Lena V.',   rating: 4, title: 'Great, slight learning curve', body: 'Took a week to adjust to the layout. Now I do not want to go back.',  createdAt: '2026-04-21T08:45:00Z' },
  { id: 'r-7', productId: 'p-6', author: 'James O.',  rating: 5, title: 'Lives in my bag',       body: 'Cold drinks stay cold. The finish does not chip. Caps screw on cleanly.',   createdAt: '2026-04-23T18:20:00Z' },
  { id: 'r-8', productId: 'p-7', author: 'Maya C.',   rating: 5, title: 'Paper is the win',      body: 'Fountain pens, no bleed-through. Lay-flat is genuinely flat.',                createdAt: '2026-04-17T12:15:00Z' },
] as const;
