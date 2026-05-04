import type { ThemeChoice } from '@/config/theme';

export type ID = string;
export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';

export interface ProductVariant {
  id: ID;
  /** e.g. "Small", "Walnut", "Olive". */
  label: string;
  /** Inventory hint — informs in-stock badge. */
  inStock: boolean;
}

export interface Product {
  id: ID;
  title: string;
  vendor: string;
  /** Price in major units (e.g. 49 for $49.00). */
  price: number;
  /** Optional crossed-out compare-at price. */
  compareAtPrice?: number;
  /** Average rating out of 5. */
  rating: number;
  reviewCount: number;
  /** Short subtitle / category. */
  category: string;
  /** Long-form description for the PDP. */
  description: string;
  /** Image identifier — placeholder gradient if absent. */
  imageKeys: readonly string[];
  variants: readonly ProductVariant[];
  /** Free-text tags for filtering. */
  tags: readonly string[];
  /** True for newly listed products — surfaces a "New" badge. */
  isNew?: boolean;
}

export interface Review {
  id: ID;
  productId: ID;
  author: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
}

export interface CartLine {
  productId: ID;
  variantId: ID;
  quantity: number;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postal: string;
  country: string;
}

export type { ThemeChoice };
