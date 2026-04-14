export function triggerHaptic(): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  } catch {
    // Silently fail if haptic feedback is not supported
  }
}