import { APP_CONFIG } from '@/config/app';

const CURRENCY_FMT = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: APP_CONFIG.currency,
  maximumFractionDigits: 0,
});

const NUM_FMT = new Intl.NumberFormat(undefined, { notation: 'compact' });

export function formatPrice(value: number): string {
  return CURRENCY_FMT.format(value);
}

export function formatCount(value: number): string {
  return NUM_FMT.format(value);
}
