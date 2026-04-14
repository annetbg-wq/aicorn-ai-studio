/**
 * toastBus.ts — imperative toast notifications from any service.
 *
 * Usage: import { showToast } from './toastBus';
 *        showToast('Working offline', 'warn');
 *
 * UI listens via <StudioToast /> component (CustomEvent on window).
 */

export type ToastLevel = 'info' | 'warn' | 'error';

export interface StudioToastEvent {
  message: string;
  level: ToastLevel;
}

export function showToast(message: string, level: ToastLevel = 'info'): void {
  window.dispatchEvent(
    new CustomEvent<StudioToastEvent>('studio-toast', {
      detail: { message, level },
    }),
  );
}
