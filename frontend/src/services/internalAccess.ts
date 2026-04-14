export function isCreatorMode(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }

  const host = window.location.hostname;
  return localStorage.getItem('AIC_DEV_AUTH_BYPASS') === '1'
    || host === 'localhost'
    || host === '127.0.0.1';
}

