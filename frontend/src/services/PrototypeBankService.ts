import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArchetypeManifest {
  id: string;
  type: 'archetype';
  name: string;
  description: string;
  whenToUse: string[];
  includes: string[];
  forbids: string[];
  routes: string[];
  entities: string[];
  requiredModules: string[];
  optionalModules: string[];
  navigation: 'bottom-tabs' | 'sidebar' | 'none';
  seedDataExample?: Record<string, unknown>;
}

export interface DomainManifest {
  id: string;
  type: 'domain';
  name: string;
  entities: string[];
  roles: string[];
  typicalFlows: string[];
  restrictions: string[];
  uiPatterns: string[];
  recommendedDesign: string;
  recommendedArchetypes: string[];
  subdomains?: string[];
  colorFamilies?: string[];
}

export interface ModuleManifest {
  id: string;
  type: 'module';
  name: string;
  description: string;
  adds: string[];
  routes: string[];
  entities: string[];
  dependencies: string[];
}

export interface SurfacePackManifest {
  id: string;
  type: 'surface-pack';
  name: string;
  description: string;
  colors: Record<string, string>;
  mood: string;
  suitableDomains: string[];
}

export interface CoreManifest {
  id: 'core';
  type: 'core';
  name: string;
  description: string;
  alwaysIncluded: true;
  components: {
    onboarding: { description: string; trigger: string; steps: string[]; completionEvent: string; storageKey: string };
    paywall: { description: string; trigger: string; plans: Array<{ id: string; price: string; features: string[] }>; storageKey: string; freeLimit: number };
    auth: { description: string; provider: string; optional: boolean; note: string };
    account: { description: string; sections: string[]; route: string };
    i18n: { description: string; defaultLanguage: string; supportedLanguages: string[]; detectionOrder: string[] };
  };
  routes: string[];
  storageKeys: string[];
  navigationGuards: string[];
}

// ─── Built-in fallback data ───────────────────────────────────────────────────

const BUILTIN_ARCHETYPES: ArchetypeManifest[] = [
  {
    id: 'consumer-feed',
    type: 'archetype',
    name: 'Consumer Feed',
    description: 'Лента контента с карточками, фильтрами и детальным просмотром',
    whenToUse: ['Приложение с лентой событий/постов/товаров', 'Социальный продукт', 'Новостной агрегатор', 'Маркетплейс с карточками'],
    includes: ['Главная лента с бесконечной прокруткой', 'Фильтры и категории', 'Детальный экран элемента', 'Bottom navigation'],
    forbids: ['Sidebar navigation (используй BottomNav)', 'Таблицы и grid-дашборды'],
    routes: ['/', '/feed', '/detail/:id', '/profile'],
    entities: ['FeedItem', 'Category', 'User'],
    requiredModules: ['feed', 'profile'],
    optionalModules: ['auth', 'search', 'notifications'],
    navigation: 'bottom-tabs',
    seedDataExample: { items: [{ id: '1', title: 'Пример заголовка', category: 'Категория', date: '2026-04-26' }] },
  },
  {
    id: 'dashboard-workspace',
    type: 'archetype',
    name: 'Dashboard Workspace',
    description: 'Рабочий дашборд с метриками, аналитикой и управлением',
    whenToUse: ['B2B инструмент', 'Аналитическая панель', 'Трекер задач/продаж', 'Административная панель'],
    includes: ['KPI карточки с метриками', 'Графики и аналитика', 'Боковое меню (Sidebar)', 'Таблицы данных', 'Экран детальной аналитики'],
    forbids: ['Bottom navigation', 'Карточный feed-лейаут'],
    routes: ['/', '/dashboard', '/analytics', '/settings'],
    entities: ['Metric', 'Report', 'Task', 'User'],
    requiredModules: ['analytics'],
    optionalModules: ['auth', 'notifications', 'settings'],
    navigation: 'sidebar',
    seedDataExample: {
      metrics: [
        { id: '1', label: 'Выручка', value: 142500, change: 12.5, trend: 'up' },
        { id: '2', label: 'Пользователи', value: 3840, change: 8.2, trend: 'up' },
        { id: '3', label: 'Конверсия', value: 4.7, change: -0.3, trend: 'down' },
      ],
    },
  },
  {
    id: 'scanner-app',
    type: 'archetype',
    name: 'Scanner App',
    description: 'Сканер/анализатор с историей результатов и детальными отчётами',
    whenToUse: ['Сканирование документов/штрихкодов', 'Диагностика и анализ', 'Медицинские измерения', 'Проверка/валидация данных'],
    includes: ['Главный экран сканирования', 'Страница результатов анализа', 'История сканирований', 'Детальный просмотр результата'],
    forbids: [],
    routes: ['/', '/scan', '/result/:id', '/history'],
    entities: ['Scan', 'Result', 'HistoryItem'],
    requiredModules: [],
    optionalModules: ['auth', 'billing', 'notifications'],
    navigation: 'bottom-tabs',
    seedDataExample: {
      history: [
        { id: '1', type: 'QR Code', result: 'https://example.com', date: '2026-04-26T10:30:00Z', status: 'success' },
        { id: '2', type: 'Barcode', result: '4607000400879', date: '2026-04-25T15:45:00Z', status: 'success' },
      ],
    },
  },
  {
    id: 'assistant-chat',
    type: 'archetype',
    name: 'Assistant Chat',
    description: 'Чат с AI-ассистентом, историей диалогов и настройками',
    whenToUse: ['AI-инструмент или чат-бот', 'Консультант или советник', 'Генератор контента', 'Диалоговый интерфейс'],
    includes: ['Интерфейс чата с потоковым ответом', 'История диалогов', 'Настройки ассистента', 'Пустое состояние с подсказками'],
    forbids: [],
    routes: ['/', '/chat', '/history', '/settings'],
    entities: ['Message', 'Conversation', 'AssistantConfig'],
    requiredModules: ['chat'],
    optionalModules: ['auth', 'billing'],
    navigation: 'bottom-tabs',
    seedDataExample: { conversations: [{ id: '1', title: 'Бизнес-план', lastMessage: 'Хорошо, вот структура...', date: '2026-04-26' }] },
  },
  {
    id: 'superapp-shell',
    type: 'archetype',
    name: 'Superapp Shell',
    description: 'Мобильное супер-приложение с несколькими разделами и богатым home-экраном',
    whenToUse: ['Многофункциональное мобильное приложение', 'Продукт с 3-5 основными разделами', 'Super-app с разными функциями'],
    includes: ['Home с featured контентом', 'Explore/Discovery раздел', 'Профиль пользователя', 'TopBar с поиском', 'BottomNav с 4 разделами'],
    forbids: [],
    routes: ['/', '/home', '/explore', '/profile', '/settings'],
    entities: ['User', 'Content', 'Category'],
    requiredModules: ['profile'],
    optionalModules: ['auth', 'feed', 'search', 'notifications'],
    navigation: 'bottom-tabs',
  },
];

const BUILTIN_DOMAINS: DomainManifest[] = [
  {
    id: 'medicine', type: 'domain', name: 'Medicine',
    entities: ['Patient', 'Doctor', 'Appointment', 'Diagnosis', 'Prescription'],
    roles: ['patient', 'doctor', 'admin'],
    typicalFlows: ['Запись на приём', 'Просмотр истории болезни', 'Получение результатов анализов', 'Видеоконсультация'],
    restrictions: ['Никаких ярких агрессивных цветов в основном UI', 'Всегда показывать дисклеймер о профессиональной консультации', 'Данные пациентов — только с подтверждением согласия'],
    uiPatterns: ['Карточки с иконками медицинских специальностей', 'Временная шкала для истории лечения', 'Прогресс-индикаторы', 'Цветовое кодирование статусов (зелёный/жёлтый/красный)'],
    recommendedDesign: 'trust-medical',
    recommendedArchetypes: ['dashboard-workspace', 'scanner-app'],
  },
  {
    id: 'fintech', type: 'domain', name: 'Fintech',
    entities: ['Account', 'Transaction', 'Budget', 'Goal', 'Card'],
    roles: ['user', 'admin'],
    typicalFlows: ['Перевод средств', 'История транзакций', 'Управление бюджетом', 'Накопительные цели'],
    restrictions: ['Всегда показывать реальные суммы в seed data (не round numbers)', 'Цветовое разделение доходов (+green) и расходов (-red)', 'Маскировка чувствительных данных (карта: ****1234)'],
    uiPatterns: ['Баланс крупным шрифтом на главном экране', 'Список транзакций с иконками категорий', 'Кольцевые/столбчатые графики бюджета', 'Прогресс-бары накоплений'],
    recommendedDesign: 'dark-premium',
    recommendedArchetypes: ['dashboard-workspace'],
  },
  {
    id: 'gaming', type: 'domain', name: 'Gaming',
    entities: ['Player', 'Game', 'Score', 'Achievement', 'Leaderboard'],
    roles: ['player'],
    typicalFlows: ['Начать игру/сессию', 'Просмотр таблицы лидеров', 'Открытие достижений', 'Просмотр статистики'],
    restrictions: [],
    uiPatterns: ['Яркие неоновые акценты', 'Анимации и переходы', 'XP прогресс-бары', 'Аватары игроков', 'Значки и трофеи'],
    recommendedDesign: 'neon-dark',
    recommendedArchetypes: ['superapp-shell', 'consumer-feed'],
  },
  {
    id: 'wellness', type: 'domain', name: 'Wellness',
    entities: ['Session', 'Habit', 'Progress', 'Goal', 'Mood'],
    roles: ['user'],
    typicalFlows: ['Начать медитацию/тренировку', 'Трекинг привычек', 'Просмотр прогресса за период', 'Добавить запись настроения'],
    restrictions: [],
    uiPatterns: ['Спокойные пастельные или приглушённые градиенты', 'Прогресс-кольца и streak-счётчики', 'Мотивирующие цитаты', 'Тёплые иллюстрации'],
    recommendedDesign: 'light-clean',
    recommendedArchetypes: ['consumer-feed', 'superapp-shell'],
  },
  {
    id: 'social', type: 'domain', name: 'Social',
    entities: ['User', 'Post', 'Comment', 'Like', 'Follow', 'Story'],
    roles: ['user'],
    typicalFlows: ['Публикация поста/фото', 'Просмотр ленты', 'Взаимодействие (лайк/комментарий)', 'Просмотр профиля'],
    restrictions: [],
    uiPatterns: ['Аватары и имена пользователей везде', 'Счётчики лайков/комментариев', 'Stories в горизонтальной прокрутке', 'Кнопки follow/unfollow'],
    recommendedDesign: 'dark-premium',
    recommendedArchetypes: ['consumer-feed', 'superapp-shell'],
  },
  {
    id: 'ai-tools', type: 'domain', name: 'AI Tools',
    entities: ['Prompt', 'Result', 'Template', 'History', 'Collection'],
    roles: ['user'],
    typicalFlows: ['Ввод запроса и получение результата', 'Выбор из шаблонов', 'Сохранение в коллекцию', 'История запросов'],
    restrictions: ['Всегда показывать анимированный индикатор при генерации', 'Не показывать технические ID моделей пользователю'],
    uiPatterns: ['Textarea с плейсхолдером-примером', 'Карточки шаблонов с категориями', 'Анимация потоковой генерации', 'Кнопки копирования результатов'],
    recommendedDesign: 'dark-premium',
    recommendedArchetypes: ['assistant-chat', 'scanner-app'],
  },
];

const BUILTIN_MODULES: ModuleManifest[] = [
  { id: 'auth', type: 'module', name: 'Authentication', description: 'Google OAuth + email/password через Supabase', adds: ['AuthModal компонент', 'useAuth hook', 'AuthProvider', 'Защита роутов (PrivateRoute)'], routes: ['/login', '/signup'], entities: ['User', 'Session'], dependencies: ['@supabase/supabase-js'] },
  { id: 'billing', type: 'module', name: 'Billing / Paywall', description: 'Paywall с тремя тарифами и управлением подпиской', adds: ['PaywallModal компонент', 'PricingCard компонент', 'useSubscription hook'], routes: ['/pricing'], entities: ['Plan', 'Subscription'], dependencies: [] },
  { id: 'feed', type: 'module', name: 'Feed', description: 'Лента контента с фильтрами и бесконечной прокруткой', adds: ['FeedList компонент', 'FeedCard компонент', 'FeedFilters компонент'], routes: ['/feed'], entities: ['FeedItem', 'Category'], dependencies: [] },
  { id: 'chat', type: 'module', name: 'Chat', description: 'Чат интерфейс с историей сообщений', adds: ['ChatView компонент', 'MessageBubble компонент', 'ChatInput компонент'], routes: ['/chat'], entities: ['Message', 'Conversation'], dependencies: [] },
  { id: 'analytics', type: 'module', name: 'Analytics', description: 'Графики и метрики через recharts', adds: ['LineChart компонент', 'BarChart компонент', 'KPICard компонент', 'MetricsSummary компонент'], routes: ['/analytics'], entities: ['Metric', 'DataPoint'], dependencies: ['recharts'] },
  { id: 'search', type: 'module', name: 'Search & Filter', description: 'Поиск и фильтрация контента', adds: ['SearchBar компонент', 'FilterPanel компонент', 'useSearch hook'], routes: [], entities: [], dependencies: [] },
  { id: 'onboarding', type: 'module', name: 'Onboarding', description: '3-шаговый онбординг с выбором параметров пользователем', adds: ['OnboardingWizard компонент', 'OnboardingStep компонент'], routes: ['/onboarding'], entities: ['UserPreferences'], dependencies: [] },
  { id: 'profile', type: 'module', name: 'User Profile', description: 'Профиль пользователя с настройками и статистикой', adds: ['ProfilePage компонент', 'AvatarUpload компонент', 'ProfileStats компонент'], routes: ['/profile'], entities: ['UserProfile'], dependencies: [] },
  { id: 'settings', type: 'module', name: 'Settings', description: 'Настройки приложения и профиля', adds: ['SettingsPage компонент', 'SettingsSection компонент', 'ToggleSetting компонент'], routes: ['/settings'], entities: ['AppSettings'], dependencies: [] },
  { id: 'notifications', type: 'module', name: 'Notifications', description: 'In-app уведомления и push-нотификации', adds: ['NotificationCenter компонент', 'NotificationItem компонент', 'usePushNotifications hook'], routes: ['/notifications'], entities: ['Notification'], dependencies: [] },
];

const BUILTIN_CORE: CoreManifest = {
  id: 'core',
  type: 'core',
  name: 'Core Layer',
  description: 'Обязательный фундамент каждого приложения. Всегда присутствует.',
  alwaysIncluded: true,
  components: {
    onboarding: {
      description: '3-шаговый онбординг при первом запуске',
      trigger: "localStorage 'onboarding_complete' !== 'true'",
      steps: ['Приветствие + ценностное предложение', 'Выбор предпочтений пользователя', 'Создание профиля или пропуск'],
      completionEvent: "window.dispatchEvent(new CustomEvent('onboarding-complete'))",
      storageKey: 'onboarding_complete',
    },
    paywall: {
      description: 'Монетизация после N бесплатных действий',
      trigger: 'usageCount >= FREE_LIMIT && !isPremium',
      plans: [
        { id: 'basic', price: '$4.99/mo', features: ['core features'] },
        { id: 'pro', price: '$9.99/mo', features: ['all features'] },
        { id: 'premium', price: '$19.99/mo', features: ['everything + priority'] },
      ],
      storageKey: 'is_premium',
      freeLimit: 3,
    },
    auth: { description: 'Google OAuth через Supabase', provider: 'google', optional: true, note: 'Авторизация необязательна для базового использования' },
    account: {
      description: 'Настройки аккаунта и профиля',
      sections: ['Профиль (имя, аватар)', 'Подписка (текущий план, управление)', 'Язык и регион', 'Уведомления', 'Данные (экспорт, удаление аккаунта)'],
      route: '/account',
    },
    i18n: {
      description: 'Мультиязычность ru/en',
      defaultLanguage: 'ru',
      supportedLanguages: ['ru', 'en'],
      detectionOrder: ["localStorage 'app_language'", 'navigator.language', 'default: ru'],
    },
  },
  routes: ['/onboarding', '/account', '/paywall'],
  storageKeys: ['onboarding_complete', 'is_premium', 'usage_count', 'app_language', 'user_profile'],
  navigationGuards: [
    '/ → /onboarding если onboarding_complete !== true',
    '/premium-feature → /paywall если !isPremium && usageCount >= FREE_LIMIT',
  ],
};

// ─── Local cache ──────────────────────────────────────────────────────────────

let archetypesCache: ArchetypeManifest[] | null = null;
let domainsCache: DomainManifest[] | null = null;
let modulesCache: ModuleManifest[] | null = null;
let coreCache: CoreManifest | null = null;

// ─── Service ──────────────────────────────────────────────────────────────────

// Network-backed prototype-bank reads are optional enrichment. Vitest must never
// wait on Supabase before using the deterministic built-in contracts.
const USE_BUILTIN_PROTOTYPE_BANK = import.meta.env.MODE === 'test';

export const PrototypeBankService = {
  async getArchetypes(): Promise<ArchetypeManifest[]> {
    if (archetypesCache) return archetypesCache;
    if (USE_BUILTIN_PROTOTYPE_BANK) return BUILTIN_ARCHETYPES;
    try {
      const { data, error } = await supabase.from('prototype_archetypes').select('manifest');
      if (error || !data?.length) throw new Error('fallback');
      archetypesCache = data.map(r => r.manifest as ArchetypeManifest);
      return archetypesCache;
    } catch {
      archetypesCache = BUILTIN_ARCHETYPES;
      return archetypesCache;
    }
  },

  async getDomains(): Promise<DomainManifest[]> {
    if (domainsCache) return domainsCache;
    if (USE_BUILTIN_PROTOTYPE_BANK) return BUILTIN_DOMAINS;
    try {
      const { data, error } = await supabase.from('prototype_domains').select('manifest');
      if (error || !data?.length) throw new Error('fallback');
      domainsCache = data.map(r => r.manifest as DomainManifest);
      return domainsCache;
    } catch {
      domainsCache = BUILTIN_DOMAINS;
      return domainsCache;
    }
  },

  async getModules(): Promise<ModuleManifest[]> {
    if (modulesCache) return modulesCache;
    if (USE_BUILTIN_PROTOTYPE_BANK) return BUILTIN_MODULES;
    try {
      const { data, error } = await supabase.from('prototype_modules').select('manifest');
      if (error || !data?.length) throw new Error('fallback');
      modulesCache = data.map(r => r.manifest as ModuleManifest);
      return modulesCache;
    } catch {
      modulesCache = BUILTIN_MODULES;
      return modulesCache;
    }
  },

  async getCoreManifest(): Promise<CoreManifest> {
    if (coreCache) return coreCache;
    if (USE_BUILTIN_PROTOTYPE_BANK) return BUILTIN_CORE;
    try {
      const { data, error } = await supabase.from('prototype_core').select('manifest').eq('id', 'core').single();
      if (error || !data) throw new Error('fallback');
      coreCache = data.manifest as CoreManifest;
      return coreCache;
    } catch {
      coreCache = BUILTIN_CORE;
      return coreCache;
    }
  },

  async getArchetype(id: string): Promise<ArchetypeManifest | null> {
    const all = await this.getArchetypes();
    return all.find(a => a.id === id) ?? null;
  },

  async getDomain(id: string): Promise<DomainManifest | null> {
    const all = await this.getDomains();
    return all.find(d => d.id === id) ?? null;
  },

  async getModule(id: string): Promise<ModuleManifest | null> {
    const all = await this.getModules();
    return all.find(m => m.id === id) ?? null;
  },

  /** Fetches archetype skeleton files from the Vite dev server endpoint */
  async getArchetypeFiles(archetypeId: string): Promise<Record<string, string>> {
    try {
      const res = await fetch(`/__prototype_bank/${archetypeId}/files`);
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
  },

  /** Returns a compact summary of all archetypes for injection into LLM prompts */
  async getArchetypeSummaryForPrompt(): Promise<string> {
    const archetypes = await this.getArchetypes();
    return archetypes.map(a =>
      `${a.id}: ${a.description} | Use when: ${a.whenToUse.slice(0, 2).join(', ')} | Nav: ${a.navigation}`
    ).join('\n');
  },

  /** Returns a compact summary of all domains for injection into LLM prompts */
  async getDomainSummaryForPrompt(): Promise<string> {
    const domains = await this.getDomains();
    return domains.map(d =>
      `${d.id}: entities=[${d.entities.join(', ')}] design=${d.recommendedDesign} archetypes=[${d.recommendedArchetypes.join(', ')}]`
    ).join('\n');
  },

  invalidateCache() {
    archetypesCache = null;
    domainsCache = null;
    modulesCache = null;
    coreCache = null;
  },
};
