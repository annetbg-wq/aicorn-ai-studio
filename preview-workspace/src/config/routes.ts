export const ROUTES = {
  home: '/',
  create: '/create',
  detail: '/habit/:id',
  progress: '/progress',
  profile: '/profile',
  onboarding: '/onboarding',
};

export const ROUTE_LABELS: Record<string, string> = {
  '/': 'Главная',
  '/create': 'Создать привычку',
  '/habit/:id': 'Детали привычки',
  '/progress': 'Прогресс',
  '/profile': 'Профиль',
  '/onboarding': 'Знакомство',
};
