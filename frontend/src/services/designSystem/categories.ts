export type CategoryId =
  // Productivity & Tools
  | 'task-manager'
  | 'note-taking'
  | 'calendar-scheduling'
  | 'time-tracking'
  | 'habit-tracker'
  // Social & Community
  | 'social-network'
  | 'chat-messaging'
  | 'community-forum'
  | 'dating-social'
  // Commerce & Business
  | 'ecommerce-store'
  | 'marketplace'
  | 'booking-service'
  | 'restaurant-food'
  // Finance
  | 'personal-finance'
  | 'investment-crypto'
  | 'banking-fintech'
  // Health & Wellness
  | 'fitness-workout'
  | 'nutrition-diet'
  | 'mental-health'
  | 'medical-health'
  // Education
  | 'e-learning'
  | 'language-learning'
  | 'kids-education'
  // Entertainment
  | 'media-streaming'
  // B2B SaaS
  | 'saas-dashboard'
  | 'crm-sales'
  | 'project-management'
  | 'hr-recruiting'
  | 'analytics-bi'
  | 'devtools'
  // AI-Powered
  | 'ai-assistant'
  | 'ai-content'
  | 'ai-analytics'
  | 'ai-automation'
  // Marketplace & Platform
  | 'talent-freelance'
  | 'b2b-marketplace'
  | 'real-estate'
  | 'travel-experiences'
  // Creator Economy
  | 'creator-tools'
  | 'newsletter-blog'
  | 'portfolio-showcase'
  | 'events-ticketing'
  // Deep Vertical
  | 'logistics-delivery'
  | 'legal-compliance'
  | 'construction-realty'
  | 'agriculture-farm'
  | 'ngo-nonprofit'
  | 'gov-civic';

export type StyleId =
  | 'dark-pro'
  | 'clean-light'
  | 'colorful-vibrant'
  | 'enterprise'
  | 'glassmorphism'
  | 'gamified'
  | 'editorial'
  | 'minimal-mono'
  | 'warm-organic'
  | 'futuristic';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  labelRu: string;
  description: string;
  keywords: string[];
  defaultStyle: StyleId;
  allowedStyles: StyleId[];
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    monoFont?: string;
  };
  uiPatterns: string[];
  exampleApps: string[];
}

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  // PRODUCTIVITY & TOOLS
  'task-manager': {
    id: 'task-manager',
    label: 'Task Manager',
    labelRu: 'Таск-менеджер',
    description: 'Todo lists, GTD systems, task tracking',
    keywords: ['task', 'todo', 'checklist', 'gtd', 'productivity', 'задача', 'список', 'чеклист', 'дедлайн', 'приоритет'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'dark-pro', 'minimal-mono', 'gamified', 'enterprise'],
    colorPalette: {
      primary: '#6366f1',
      secondary: '#8b5cf6',
      accent: '#06b6d4',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#0f172a',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['checkbox-list', 'kanban-board', 'priority-badge', 'due-date-chip', 'progress-bar', 'subtask-indent', 'drag-drop-reorder', 'filter-tabs'],
    exampleApps: ['Todoist', 'Things', 'TickTick', 'Linear', 'Asana'],
  },

  'note-taking': {
    id: 'note-taking',
    label: 'Note Taking',
    labelRu: 'Заметки',
    description: 'Notes, wikis, knowledge bases, docs',
    keywords: ['note', 'wiki', 'knowledge', 'document', 'markdown', 'заметка', 'вики', 'документ', 'база знаний', 'текст'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'dark-pro', 'minimal-mono', 'editorial', 'enterprise'],
    colorPalette: {
      primary: '#0f172a',
      secondary: '#475569',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
    },
    typography: {
      headingFont: 'Georgia',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    },
    uiPatterns: ['sidebar-tree', 'rich-text-editor', 'tag-system', 'backlink-panel', 'breadcrumb', 'block-editor', 'table-of-contents', 'search-spotlight'],
    exampleApps: ['Notion', 'Obsidian', 'Roam', 'Bear', 'Craft'],
  },

  'calendar-scheduling': {
    id: 'calendar-scheduling',
    label: 'Calendar & Scheduling',
    labelRu: 'Календарь и расписание',
    description: 'Calendars, booking systems, scheduling tools',
    keywords: ['calendar', 'schedule', 'booking', 'appointment', 'встреча', 'календарь', 'расписание', 'бронь', 'слот'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'dark-pro', 'enterprise', 'minimal-mono', 'colorful-vibrant'],
    colorPalette: {
      primary: '#2563eb',
      secondary: '#3b82f6',
      accent: '#10b981',
      background: '#ffffff',
      surface: '#f0f9ff',
      text: '#1e3a5f',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['month-grid', 'week-view', 'time-slot-grid', 'event-card', 'availability-picker', 'recurring-badge', 'timezone-selector', 'booking-modal'],
    exampleApps: ['Google Calendar', 'Calendly', 'Cal.com', 'Fantastical', 'Acuity'],
  },

  'time-tracking': {
    id: 'time-tracking',
    label: 'Time Tracking',
    labelRu: 'Трекинг времени',
    description: 'Time trackers, Pomodoro, productivity timers',
    keywords: ['time', 'timer', 'pomodoro', 'track', 'hours', 'время', 'таймер', 'трекинг', 'часы', 'фокус'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'clean-light', 'minimal-mono', 'gamified', 'futuristic'],
    colorPalette: {
      primary: '#f97316',
      secondary: '#fb923c',
      accent: '#fbbf24',
      background: '#0c0a09',
      surface: '#1c1917',
      text: '#fafaf9',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    },
    uiPatterns: ['circular-timer', 'timeline-chart', 'session-list', 'project-breakdown', 'weekly-heatmap', 'start-stop-button', 'focus-mode', 'stats-card'],
    exampleApps: ['Toggl', 'Harvest', 'Clockify', 'Forest', 'Be Focused'],
  },

  'habit-tracker': {
    id: 'habit-tracker',
    label: 'Habit Tracker',
    labelRu: 'Трекер привычек',
    description: 'Habit tracking, streaks, behavior change',
    keywords: ['habit', 'streak', 'routine', 'daily', 'goal', 'привычка', 'стрик', 'рутина', 'цель', 'прогресс'],
    defaultStyle: 'colorful-vibrant',
    allowedStyles: ['colorful-vibrant', 'gamified', 'clean-light', 'dark-pro', 'warm-organic'],
    colorPalette: {
      primary: '#8b5cf6',
      secondary: '#a78bfa',
      accent: '#34d399',
      background: '#faf5ff',
      surface: '#f3e8ff',
      text: '#1e1b4b',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['streak-counter', 'habit-grid', 'completion-ring', 'motivation-quote', 'weekly-chart', 'category-color', 'check-animation', 'achievement-badge'],
    exampleApps: ['Habitica', 'Streaks', 'Done', 'Finch', 'Fabulous'],
  },

  // SOCIAL & COMMUNITY
  'social-network': {
    id: 'social-network',
    label: 'Social Network',
    labelRu: 'Социальная сеть',
    description: 'Social feeds, profiles, connections',
    keywords: ['social', 'feed', 'post', 'follow', 'profile', 'соцсеть', 'лента', 'пост', 'подписка', 'профиль'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'dark-pro', 'colorful-vibrant', 'glassmorphism', 'editorial'],
    colorPalette: {
      primary: '#1d4ed8',
      secondary: '#3b82f6',
      accent: '#f43f5e',
      background: '#f0f2f5',
      surface: '#ffffff',
      text: '#050505',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['post-card', 'avatar-stack', 'like-button', 'comment-thread', 'story-circle', 'notification-badge', 'follow-button', 'infinite-scroll'],
    exampleApps: ['Twitter/X', 'Instagram', 'LinkedIn', 'Facebook', 'Threads'],
  },

  'chat-messaging': {
    id: 'chat-messaging',
    label: 'Chat & Messaging',
    labelRu: 'Мессенджер',
    description: 'Chats, messaging, real-time communication',
    keywords: ['chat', 'message', 'messenger', 'direct', 'channel', 'чат', 'сообщение', 'мессенджер', 'канал', 'переписка'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'clean-light', 'glassmorphism', 'colorful-vibrant', 'minimal-mono'],
    colorPalette: {
      primary: '#7c3aed',
      secondary: '#8b5cf6',
      accent: '#10b981',
      background: '#1a1a2e',
      surface: '#16213e',
      text: '#e2e8f0',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['chat-bubble', 'message-thread', 'channel-list', 'typing-indicator', 'read-receipt', 'emoji-reaction', 'file-attachment', 'online-status'],
    exampleApps: ['Slack', 'Discord', 'Telegram', 'WhatsApp', 'Signal'],
  },

  'community-forum': {
    id: 'community-forum',
    label: 'Community & Forum',
    labelRu: 'Форум и сообщество',
    description: 'Forums, Q&A, discussions, communities',
    keywords: ['forum', 'community', 'discussion', 'thread', 'qa', 'форум', 'сообщество', 'обсуждение', 'тред', 'вопрос'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'dark-pro', 'editorial', 'enterprise', 'minimal-mono'],
    colorPalette: {
      primary: '#ff4500',
      secondary: '#ff6534',
      accent: '#0dd3bb',
      background: '#dae0e6',
      surface: '#ffffff',
      text: '#1c1c1c',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['thread-list', 'vote-button', 'reply-indent', 'flair-badge', 'moderator-tag', 'award-icon', 'sort-tabs', 'sidebar-widget'],
    exampleApps: ['Reddit', 'Discourse', 'Stack Overflow', 'Hacker News', 'Quora'],
  },

  'dating-social': {
    id: 'dating-social',
    label: 'Dating & Social',
    labelRu: 'Знакомства',
    description: 'Dating apps, matching, social connections',
    keywords: ['dating', 'match', 'swipe', 'profile', 'connect', 'знакомства', 'мэтч', 'свайп', 'пара', 'встреча'],
    defaultStyle: 'colorful-vibrant',
    allowedStyles: ['colorful-vibrant', 'glassmorphism', 'warm-organic', 'dark-pro', 'futuristic'],
    colorPalette: {
      primary: '#e11d48',
      secondary: '#fb7185',
      accent: '#f97316',
      background: '#fff1f2',
      surface: '#ffffff',
      text: '#1e1b1b',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['swipe-card', 'match-animation', 'photo-grid', 'compatibility-score', 'like-dislike', 'super-like', 'blur-preview', 'distance-badge'],
    exampleApps: ['Tinder', 'Bumble', 'Hinge', 'OkCupid', 'Badoo'],
  },

  // COMMERCE & BUSINESS
  'ecommerce-store': {
    id: 'ecommerce-store',
    label: 'E-commerce Store',
    labelRu: 'Интернет-магазин',
    description: 'Online stores, product catalogs, shopping carts',
    keywords: ['shop', 'store', 'ecommerce', 'product', 'cart', 'магазин', 'товар', 'корзина', 'покупка', 'каталог'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'dark-pro', 'editorial', 'colorful-vibrant', 'enterprise'],
    colorPalette: {
      primary: '#16a34a',
      secondary: '#22c55e',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['product-grid', 'product-card', 'cart-drawer', 'price-badge', 'rating-stars', 'filter-sidebar', 'image-gallery', 'add-to-cart-button'],
    exampleApps: ['Shopify', 'WooCommerce', 'Amazon', 'Etsy', 'ASOS'],
  },

  'marketplace': {
    id: 'marketplace',
    label: 'Marketplace',
    labelRu: 'Маркетплейс',
    description: 'Two-sided marketplaces, listings, peer-to-peer',
    keywords: ['marketplace', 'listing', 'seller', 'buyer', 'classified', 'маркетплейс', 'объявление', 'продавец', 'покупатель', 'лот'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'colorful-vibrant', 'enterprise', 'editorial', 'dark-pro'],
    colorPalette: {
      primary: '#2563eb',
      secondary: '#3b82f6',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#0f172a',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['listing-card', 'seller-profile', 'search-filters', 'price-range', 'map-view', 'trust-badge', 'bid-button', 'category-nav'],
    exampleApps: ['Airbnb', 'eBay', 'Fiverr', 'Avito', 'Farfetch'],
  },

  'booking-service': {
    id: 'booking-service',
    label: 'Booking & Services',
    labelRu: 'Бронирование и услуги',
    description: 'Service booking, appointments, reservations',
    keywords: ['booking', 'appointment', 'service', 'reservation', 'slot', 'бронь', 'запись', 'услуга', 'резерв', 'мастер'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'enterprise', 'colorful-vibrant', 'warm-organic', 'minimal-mono'],
    colorPalette: {
      primary: '#0891b2',
      secondary: '#06b6d4',
      accent: '#8b5cf6',
      background: '#f0fdff',
      surface: '#ffffff',
      text: '#0c4a6e',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['service-card', 'time-picker', 'provider-profile', 'booking-form', 'confirmation-step', 'review-stars', 'availability-grid', 'price-breakdown'],
    exampleApps: ['Booksy', 'Treatwell', 'Fresha', 'SimplyBook', 'Vagaro'],
  },

  'restaurant-food': {
    id: 'restaurant-food',
    label: 'Restaurant & Food',
    labelRu: 'Ресторан и еда',
    description: 'Restaurants, food delivery, menus, recipes',
    keywords: ['restaurant', 'food', 'delivery', 'menu', 'recipe', 'ресторан', 'еда', 'доставка', 'меню', 'рецепт'],
    defaultStyle: 'warm-organic',
    allowedStyles: ['warm-organic', 'editorial', 'dark-pro', 'colorful-vibrant', 'clean-light'],
    colorPalette: {
      primary: '#dc2626',
      secondary: '#ef4444',
      accent: '#f97316',
      background: '#fffbf0',
      surface: '#ffffff',
      text: '#1c0a00',
    },
    typography: {
      headingFont: 'Playfair Display',
      bodyFont: 'Inter',
    },
    uiPatterns: ['food-card', 'menu-section', 'cart-summary', 'rating-badge', 'delivery-time', 'diet-tag', 'photo-hero', 'order-tracker'],
    exampleApps: ['UberEats', 'DoorDash', 'OpenTable', 'Yelp', 'TheFork'],
  },

  // FINANCE
  'personal-finance': {
    id: 'personal-finance',
    label: 'Personal Finance',
    labelRu: 'Личные финансы',
    description: 'Budget tracking, expenses, personal finance',
    keywords: ['budget', 'expense', 'finance', 'money', 'savings', 'бюджет', 'расход', 'финансы', 'деньги', 'накопления'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'dark-pro', 'enterprise', 'minimal-mono', 'colorful-vibrant'],
    colorPalette: {
      primary: '#16a34a',
      secondary: '#22c55e',
      accent: '#f59e0b',
      background: '#f0fdf4',
      surface: '#ffffff',
      text: '#052e16',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    },
    uiPatterns: ['expense-chart', 'category-pie', 'transaction-list', 'budget-progress', 'monthly-summary', 'income-expense-bar', 'savings-goal', 'currency-format'],
    exampleApps: ['YNAB', 'Mint', 'Copilot', 'Money Dashboard', 'Toshl'],
  },

  'investment-crypto': {
    id: 'investment-crypto',
    label: 'Investment & Crypto',
    labelRu: 'Инвестиции и крипто',
    description: 'Portfolio tracking, investments, crypto',
    keywords: ['invest', 'portfolio', 'crypto', 'stock', 'trading', 'инвестиции', 'портфель', 'крипто', 'акции', 'трейдинг'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'futuristic', 'enterprise', 'clean-light', 'minimal-mono'],
    colorPalette: {
      primary: '#f59e0b',
      secondary: '#fbbf24',
      accent: '#10b981',
      background: '#0a0a0f',
      surface: '#13131f',
      text: '#f1f5f9',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    },
    uiPatterns: ['price-chart', 'portfolio-donut', 'asset-row', 'gain-loss-badge', 'candlestick', 'order-book', 'market-ticker', 'alert-bell'],
    exampleApps: ['Coinbase', 'Robinhood', 'Blockfolio', 'Trading212', 'Delta'],
  },

  'banking-fintech': {
    id: 'banking-fintech',
    label: 'Banking & Fintech',
    labelRu: 'Банкинг и финтех',
    description: 'Digital banking, payments, fintech products',
    keywords: ['bank', 'payment', 'transfer', 'fintech', 'wallet', 'банк', 'платёж', 'перевод', 'финтех', 'кошелёк'],
    defaultStyle: 'enterprise',
    allowedStyles: ['enterprise', 'dark-pro', 'clean-light', 'glassmorphism', 'futuristic'],
    colorPalette: {
      primary: '#1e40af',
      secondary: '#2563eb',
      accent: '#0891b2',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    },
    uiPatterns: ['balance-card', 'transaction-history', 'transfer-form', 'card-visual', 'spending-chart', 'security-badge', 'quick-action', 'account-list'],
    exampleApps: ['Revolut', 'N26', 'Monzo', 'Wise', 'Starling'],
  },

  // HEALTH & WELLNESS
  'fitness-workout': {
    id: 'fitness-workout',
    label: 'Fitness & Workout',
    labelRu: 'Фитнес и тренировки',
    description: 'Workout apps, fitness tracking, gym tools',
    keywords: ['fitness', 'workout', 'exercise', 'gym', 'training', 'фитнес', 'тренировка', 'упражнение', 'зал', 'спорт'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'colorful-vibrant', 'gamified', 'clean-light', 'futuristic'],
    colorPalette: {
      primary: '#ef4444',
      secondary: '#f97316',
      accent: '#fbbf24',
      background: '#0c0a09',
      surface: '#1c1917',
      text: '#fafaf9',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['exercise-card', 'set-rep-counter', 'rest-timer', 'muscle-map', 'progress-chart', 'workout-history', 'achievement-ring', 'heart-rate-gauge'],
    exampleApps: ['Nike Training', 'Whoop', 'Strong', 'Hevy', 'FitBod'],
  },

  'nutrition-diet': {
    id: 'nutrition-diet',
    label: 'Nutrition & Diet',
    labelRu: 'Питание и диета',
    description: 'Food tracking, calories, nutrition, recipes',
    keywords: ['nutrition', 'diet', 'calorie', 'food', 'meal', 'питание', 'диета', 'калория', 'еда', 'рацион'],
    defaultStyle: 'warm-organic',
    allowedStyles: ['warm-organic', 'clean-light', 'colorful-vibrant', 'gamified', 'minimal-mono'],
    colorPalette: {
      primary: '#16a34a',
      secondary: '#22c55e',
      accent: '#f97316',
      background: '#f0fdf4',
      surface: '#ffffff',
      text: '#052e16',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['macro-ring', 'meal-log', 'food-search', 'nutrition-label', 'water-tracker', 'recipe-card', 'daily-summary', 'barcode-scan'],
    exampleApps: ['MyFitnessPal', 'Cronometer', 'Lifesum', 'Noom', 'Yazio'],
  },

  'mental-health': {
    id: 'mental-health',
    label: 'Mental Health',
    labelRu: 'Ментальное здоровье',
    description: 'Meditation, mindfulness, therapy, mental wellness',
    keywords: ['meditation', 'mindfulness', 'mental', 'therapy', 'mood', 'медитация', 'осознанность', 'терапия', 'настроение', 'стресс'],
    defaultStyle: 'warm-organic',
    allowedStyles: ['warm-organic', 'clean-light', 'glassmorphism', 'minimal-mono', 'colorful-vibrant'],
    colorPalette: {
      primary: '#7c3aed',
      secondary: '#8b5cf6',
      accent: '#06b6d4',
      background: '#faf5ff',
      surface: '#f3e8ff',
      text: '#1e1b4b',
    },
    typography: {
      headingFont: 'Georgia',
      bodyFont: 'Inter',
    },
    uiPatterns: ['mood-selector', 'breathing-animation', 'journal-entry', 'session-player', 'progress-streak', 'affirmation-card', 'sleep-chart', 'check-in-prompt'],
    exampleApps: ['Calm', 'Headspace', 'Woebot', 'Reflectly', 'Daylio'],
  },

  'medical-health': {
    id: 'medical-health',
    label: 'Medical & Health',
    labelRu: 'Медицина и здоровье',
    description: 'Health records, symptoms, medical tools',
    keywords: ['medical', 'health', 'symptom', 'doctor', 'prescription', 'медицина', 'здоровье', 'симптом', 'врач', 'рецепт'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'enterprise', 'minimal-mono', 'warm-organic', 'dark-pro'],
    colorPalette: {
      primary: '#0891b2',
      secondary: '#06b6d4',
      accent: '#10b981',
      background: '#f0fdff',
      surface: '#ffffff',
      text: '#0c4a6e',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['health-metric-card', 'medication-reminder', 'appointment-slot', 'vitals-chart', 'diagnosis-list', 'doctor-profile', 'telemedicine-video', 'prescription-card'],
    exampleApps: ['Apple Health', 'Zocdoc', 'Ada', 'Babylon', 'Practo'],
  },

  // EDUCATION
  'e-learning': {
    id: 'e-learning',
    label: 'E-Learning',
    labelRu: 'Онлайн-обучение',
    description: 'Online courses, LMS, educational platforms',
    keywords: ['course', 'learn', 'education', 'lesson', 'lms', 'курс', 'обучение', 'урок', 'образование', 'лекция'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'colorful-vibrant', 'gamified', 'dark-pro', 'enterprise'],
    colorPalette: {
      primary: '#7c3aed',
      secondary: '#8b5cf6',
      accent: '#f59e0b',
      background: '#fafafa',
      surface: '#ffffff',
      text: '#111827',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['course-card', 'lesson-list', 'video-player', 'quiz-question', 'progress-bar', 'certificate-badge', 'instructor-profile', 'enrollment-cta'],
    exampleApps: ['Udemy', 'Coursera', 'Teachable', 'Skillshare', 'Thinkific'],
  },

  'language-learning': {
    id: 'language-learning',
    label: 'Language Learning',
    labelRu: 'Изучение языков',
    description: 'Language apps, vocabulary, speaking practice',
    keywords: ['language', 'vocabulary', 'grammar', 'translate', 'speak', 'язык', 'словарь', 'грамматика', 'перевод', 'говорить'],
    defaultStyle: 'gamified',
    allowedStyles: ['gamified', 'colorful-vibrant', 'clean-light', 'warm-organic', 'dark-pro'],
    colorPalette: {
      primary: '#16a34a',
      secondary: '#22c55e',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f0fdf4',
      text: '#052e16',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['flashcard', 'streak-flame', 'xp-bar', 'lesson-path', 'heart-lives', 'pronunciation-button', 'match-game', 'skill-tree'],
    exampleApps: ['Duolingo', 'Babbel', 'Anki', 'Pimsleur', 'italki'],
  },

  'kids-education': {
    id: 'kids-education',
    label: 'Kids Education',
    labelRu: 'Детское образование',
    description: 'Educational apps for children, gamified learning',
    keywords: ['kids', 'children', 'school', 'game', 'learn', 'дети', 'ребёнок', 'школа', 'игра', 'обучение'],
    defaultStyle: 'gamified',
    allowedStyles: ['gamified', 'colorful-vibrant', 'warm-organic', 'clean-light', 'editorial'],
    colorPalette: {
      primary: '#f59e0b',
      secondary: '#fbbf24',
      accent: '#ec4899',
      background: '#fffbeb',
      surface: '#ffffff',
      text: '#1c1917',
    },
    typography: {
      headingFont: 'Nunito',
      bodyFont: 'Nunito',
    },
    uiPatterns: ['large-button', 'character-avatar', 'star-reward', 'progress-path', 'sound-button', 'drag-drop-puzzle', 'celebration-animation', 'parent-dashboard'],
    exampleApps: ['Khan Academy Kids', 'Prodigy', 'ABCmouse', 'Starfall', 'Endless Alphabet'],
  },

  // ENTERTAINMENT
  'media-streaming': {
    id: 'media-streaming',
    label: 'Media & Streaming',
    labelRu: 'Медиа и стриминг',
    description: 'Video, music, podcast streaming platforms',
    keywords: ['video', 'music', 'podcast', 'stream', 'watch', 'видео', 'музыка', 'подкаст', 'стрим', 'смотреть'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'glassmorphism', 'futuristic', 'editorial', 'colorful-vibrant'],
    colorPalette: {
      primary: '#e50914',
      secondary: '#b20710',
      accent: '#f5f5f1',
      background: '#141414',
      surface: '#1f1f1f',
      text: '#ffffff',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['content-hero', 'thumbnail-grid', 'play-button', 'progress-bar', 'episode-list', 'category-row', 'autoplay-countdown', 'quality-selector'],
    exampleApps: ['Netflix', 'Spotify', 'YouTube', 'Apple TV+', 'Twitch'],
  },

  // B2B SAAS
  'saas-dashboard': {
    id: 'saas-dashboard',
    label: 'SaaS Dashboard',
    labelRu: 'SaaS Дашборд',
    description: 'Analytics dashboards, metrics, SaaS admin panels',
    keywords: ['dashboard', 'analytics', 'metrics', 'saas', 'admin', 'дашборд', 'аналитика', 'метрики', 'панель', 'статистика'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'clean-light', 'enterprise', 'glassmorphism', 'colorful-vibrant'],
    colorPalette: {
      primary: '#6366f1',
      secondary: '#8b5cf6',
      accent: '#06b6d4',
      background: '#0f0f23',
      surface: '#1a1a2e',
      text: '#e2e8f0',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    },
    uiPatterns: ['kpi-card', 'line-chart', 'bar-chart', 'data-table', 'sidebar-nav', 'date-range-picker', 'filter-dropdown', 'export-button'],
    exampleApps: ['Mixpanel', 'Amplitude', 'Grafana', 'Datadog', 'Retool'],
  },

  'crm-sales': {
    id: 'crm-sales',
    label: 'CRM & Sales',
    labelRu: 'CRM и продажи',
    description: 'CRM systems, sales pipelines, deal tracking',
    keywords: ['crm', 'sales', 'pipeline', 'deal', 'lead', 'crm', 'продажи', 'воронка', 'сделка', 'лид'],
    defaultStyle: 'enterprise',
    allowedStyles: ['enterprise', 'clean-light', 'dark-pro', 'colorful-vibrant', 'minimal-mono'],
    colorPalette: {
      primary: '#0369a1',
      secondary: '#0891b2',
      accent: '#16a34a',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['pipeline-kanban', 'deal-card', 'contact-list', 'activity-feed', 'forecast-chart', 'email-thread', 'stage-progress', 'win-rate-badge'],
    exampleApps: ['Salesforce', 'HubSpot', 'Pipedrive', 'Close', 'Affinity'],
  },

  'project-management': {
    id: 'project-management',
    label: 'Project Management',
    labelRu: 'Управление проектами',
    description: 'Project tracking, team management, agile tools',
    keywords: ['project', 'sprint', 'kanban', 'agile', 'team', 'проект', 'спринт', 'канбан', 'команда', 'задача'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'dark-pro', 'enterprise', 'colorful-vibrant', 'minimal-mono'],
    colorPalette: {
      primary: '#4f46e5',
      secondary: '#6366f1',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#0f172a',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['kanban-board', 'gantt-chart', 'sprint-board', 'milestone-timeline', 'team-avatar', 'burndown-chart', 'story-points', 'dependency-arrow'],
    exampleApps: ['Linear', 'Jira', 'Asana', 'Monday.com', 'ClickUp'],
  },

  'hr-recruiting': {
    id: 'hr-recruiting',
    label: 'HR & Recruiting',
    labelRu: 'HR и найм',
    description: 'HR tools, ATS, onboarding, employee management',
    keywords: ['hr', 'recruit', 'hire', 'employee', 'onboard', 'найм', 'сотрудник', 'онбординг', 'кандидат', 'вакансия'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'enterprise', 'warm-organic', 'colorful-vibrant', 'minimal-mono'],
    colorPalette: {
      primary: '#0891b2',
      secondary: '#06b6d4',
      accent: '#8b5cf6',
      background: '#f0fdff',
      surface: '#ffffff',
      text: '#0c4a6e',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['candidate-card', 'pipeline-stages', 'job-posting', 'interview-schedule', 'offer-letter', 'onboarding-checklist', 'org-chart', 'skills-matrix'],
    exampleApps: ['Greenhouse', 'Lever', 'Workday', 'BambooHR', 'Notion HR'],
  },

  'analytics-bi': {
    id: 'analytics-bi',
    label: 'Analytics & BI',
    labelRu: 'Аналитика и BI',
    description: 'Business intelligence, reporting, data visualization',
    keywords: ['analytics', 'bi', 'report', 'data', 'insight', 'аналитика', 'отчёт', 'данные', 'инсайт', 'визуализация'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'clean-light', 'enterprise', 'minimal-mono', 'colorful-vibrant'],
    colorPalette: {
      primary: '#2563eb',
      secondary: '#3b82f6',
      accent: '#06b6d4',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f1f5f9',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    },
    uiPatterns: ['data-table', 'chart-grid', 'filter-panel', 'drill-down', 'cohort-table', 'funnel-chart', 'segment-builder', 'export-csv'],
    exampleApps: ['Tableau', 'Looker', 'Metabase', 'PowerBI', 'Superset'],
  },

  'devtools': {
    id: 'devtools',
    label: 'Developer Tools',
    labelRu: 'Инструменты разработчика',
    description: 'Dev tools, API management, CLI, developer portals',
    keywords: ['developer', 'api', 'cli', 'devops', 'code', 'разработчик', 'апи', 'код', 'девопс', 'консоль'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'minimal-mono', 'enterprise', 'futuristic', 'clean-light'],
    colorPalette: {
      primary: '#a78bfa',
      secondary: '#8b5cf6',
      accent: '#34d399',
      background: '#0d1117',
      surface: '#161b22',
      text: '#c9d1d9',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    },
    uiPatterns: ['code-editor', 'terminal-output', 'api-endpoint-list', 'request-builder', 'response-viewer', 'schema-tree', 'log-stream', 'version-badge'],
    exampleApps: ['Postman', 'Insomnia', 'Vercel', 'Railway', 'Supabase'],
  },

  // AI-POWERED
  'ai-assistant': {
    id: 'ai-assistant',
    label: 'AI Assistant',
    labelRu: 'AI Ассистент',
    description: 'AI chatbots, copilots, conversational AI',
    keywords: ['ai', 'assistant', 'chatbot', 'copilot', 'gpt', 'ии', 'ассистент', 'чатбот', 'нейросеть', 'генерация'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'glassmorphism', 'futuristic', 'clean-light', 'minimal-mono'],
    colorPalette: {
      primary: '#7c3aed',
      secondary: '#8b5cf6',
      accent: '#06b6d4',
      background: '#0f0f1a',
      surface: '#1a1a2e',
      text: '#e2e8f0',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    },
    uiPatterns: ['chat-interface', 'message-bubble', 'typing-dots', 'prompt-input', 'model-selector', 'token-counter', 'history-sidebar', 'copy-button'],
    exampleApps: ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Character.ai'],
  },

  'ai-content': {
    id: 'ai-content',
    label: 'AI Content',
    labelRu: 'AI Контент',
    description: 'AI writing, image generation, content creation',
    keywords: ['content', 'write', 'generate', 'copy', 'creative', 'контент', 'текст', 'генерация', 'копирайтинг', 'творчество'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'editorial', 'dark-pro', 'glassmorphism', 'colorful-vibrant'],
    colorPalette: {
      primary: '#ec4899',
      secondary: '#f43f5e',
      accent: '#8b5cf6',
      background: '#fff1f2',
      surface: '#ffffff',
      text: '#1e1b1b',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['template-picker', 'prompt-input', 'output-preview', 'tone-selector', 'word-count', 'version-history', 'export-options', 'brand-voice'],
    exampleApps: ['Jasper', 'Copy.ai', 'Writesonic', 'Midjourney', 'Runway'],
  },

  'ai-analytics': {
    id: 'ai-analytics',
    label: 'AI Analytics',
    labelRu: 'AI Аналитика',
    description: 'AI-powered insights, predictions, anomaly detection',
    keywords: ['predict', 'forecast', 'anomaly', 'insight', 'ml', 'прогноз', 'аномалия', 'инсайт', 'машинное обучение', 'модель'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'enterprise', 'futuristic', 'clean-light', 'minimal-mono'],
    colorPalette: {
      primary: '#0891b2',
      secondary: '#06b6d4',
      accent: '#a78bfa',
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f1f5f9',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
      monoFont: 'JetBrains Mono',
    },
    uiPatterns: ['prediction-card', 'confidence-bar', 'anomaly-alert', 'trend-line', 'feature-importance', 'model-accuracy', 'data-pipeline', 'explain-tooltip'],
    exampleApps: ['DataRobot', 'H2O.ai', 'Obviously.ai', 'MonkeyLearn', 'Akkio'],
  },

  'ai-automation': {
    id: 'ai-automation',
    label: 'AI Automation',
    labelRu: 'AI Автоматизация',
    description: 'Workflow automation, no-code, AI agents',
    keywords: ['automation', 'workflow', 'nocode', 'agent', 'trigger', 'автоматизация', 'воркфлоу', 'ноукод', 'агент', 'триггер'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'dark-pro', 'enterprise', 'futuristic', 'minimal-mono'],
    colorPalette: {
      primary: '#f97316',
      secondary: '#fb923c',
      accent: '#8b5cf6',
      background: '#fff7ed',
      surface: '#ffffff',
      text: '#1c1917',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['flow-builder', 'node-connection', 'trigger-card', 'action-block', 'run-history', 'condition-branch', 'integration-logo', 'status-badge'],
    exampleApps: ['Zapier', 'Make', 'n8n', 'Bardeen', 'Relay.app'],
  },

  // MARKETPLACE & PLATFORM
  'talent-freelance': {
    id: 'talent-freelance',
    label: 'Talent & Freelance',
    labelRu: 'Таланты и фриланс',
    description: 'Freelance platforms, talent marketplaces, portfolios',
    keywords: ['freelance', 'talent', 'portfolio', 'hire', 'gig', 'фриланс', 'талант', 'портфолио', 'найм', 'гиг'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'editorial', 'colorful-vibrant', 'warm-organic', 'enterprise'],
    colorPalette: {
      primary: '#16a34a',
      secondary: '#22c55e',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['talent-card', 'skill-tag', 'portfolio-grid', 'rate-badge', 'availability-dot', 'review-score', 'project-brief', 'proposal-form'],
    exampleApps: ['Upwork', 'Fiverr', 'Toptal', 'Contra', '99designs'],
  },

  'b2b-marketplace': {
    id: 'b2b-marketplace',
    label: 'B2B Marketplace',
    labelRu: 'B2B Маркетплейс',
    description: 'B2B platforms, procurement, vendor management',
    keywords: ['b2b', 'procurement', 'vendor', 'supplier', 'wholesale', 'б2б', 'закупки', 'вендор', 'поставщик', 'оптовый'],
    defaultStyle: 'enterprise',
    allowedStyles: ['enterprise', 'clean-light', 'dark-pro', 'minimal-mono', 'colorful-vibrant'],
    colorPalette: {
      primary: '#1e40af',
      secondary: '#2563eb',
      accent: '#16a34a',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['vendor-profile', 'rfq-form', 'quote-comparison', 'category-tree', 'bulk-order', 'contract-status', 'certification-badge', 'payment-terms'],
    exampleApps: ['Alibaba', 'Faire', 'Thomasnet', 'Coupa', 'Jaggaer'],
  },

  'real-estate': {
    id: 'real-estate',
    label: 'Real Estate',
    labelRu: 'Недвижимость',
    description: 'Real estate listings, property management, rentals',
    keywords: ['real estate', 'property', 'rent', 'buy', 'apartment', 'недвижимость', 'квартира', 'аренда', 'продажа', 'объект'],
    defaultStyle: 'clean-light',
    allowedStyles: ['clean-light', 'editorial', 'enterprise', 'warm-organic', 'dark-pro'],
    colorPalette: {
      primary: '#0369a1',
      secondary: '#0891b2',
      accent: '#16a34a',
      background: '#f0f9ff',
      surface: '#ffffff',
      text: '#0c4a6e',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['property-card', 'map-pins', 'photo-carousel', 'price-filter', 'floor-plan', 'virtual-tour', 'agent-contact', 'mortgage-calc'],
    exampleApps: ['Zillow', 'Realtor.com', 'Rightmove', 'Cian', 'Airbnb'],
  },

  'travel-experiences': {
    id: 'travel-experiences',
    label: 'Travel & Experiences',
    labelRu: 'Путешествия и впечатления',
    description: 'Travel planning, experiences, tours, accommodation',
    keywords: ['travel', 'trip', 'tour', 'hotel', 'flight', 'путешествие', 'тур', 'отель', 'перелёт', 'бронь'],
    defaultStyle: 'editorial',
    allowedStyles: ['editorial', 'colorful-vibrant', 'warm-organic', 'glassmorphism', 'clean-light'],
    colorPalette: {
      primary: '#0891b2',
      secondary: '#06b6d4',
      accent: '#f59e0b',
      background: '#f0fdff',
      surface: '#ffffff',
      text: '#0c4a6e',
    },
    typography: {
      headingFont: 'Playfair Display',
      bodyFont: 'Inter',
    },
    uiPatterns: ['destination-hero', 'itinerary-timeline', 'experience-card', 'map-preview', 'price-breakdown', 'review-highlights', 'photo-masonry', 'booking-cta'],
    exampleApps: ['Airbnb', 'Booking.com', 'GetYourGuide', 'Viator', 'TripAdvisor'],
  },

  // CREATOR ECONOMY
  'creator-tools': {
    id: 'creator-tools',
    label: 'Creator Tools',
    labelRu: 'Инструменты для креаторов',
    description: 'Tools for content creators, streamers, influencers',
    keywords: ['creator', 'streamer', 'influencer', 'content', 'youtube', 'креатор', 'стример', 'инфлюенсер', 'контент', 'ютуб'],
    defaultStyle: 'dark-pro',
    allowedStyles: ['dark-pro', 'colorful-vibrant', 'glassmorphism', 'editorial', 'futuristic'],
    colorPalette: {
      primary: '#ec4899',
      secondary: '#f43f5e',
      accent: '#f59e0b',
      background: '#0f0a1a',
      surface: '#1a0f2e',
      text: '#f3e8ff',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['analytics-overview', 'content-calendar', 'audience-stats', 'monetization-card', 'brand-deal', 'thumbnail-preview', 'comment-feed', 'revenue-chart'],
    exampleApps: ['Creator Studio', 'Koji', 'Stan', 'Beacons', 'Later'],
  },

  'newsletter-blog': {
    id: 'newsletter-blog',
    label: 'Newsletter & Blog',
    labelRu: 'Рассылка и блог',
    description: 'Email newsletters, blogs, publishing platforms',
    keywords: ['newsletter', 'blog', 'publish', 'subscribe', 'email', 'рассылка', 'блог', 'публикация', 'подписка', 'письмо'],
    defaultStyle: 'editorial',
    allowedStyles: ['editorial', 'clean-light', 'minimal-mono', 'warm-organic', 'dark-pro'],
    colorPalette: {
      primary: '#0f172a',
      secondary: '#334155',
      accent: '#f59e0b',
      background: '#fffef7',
      surface: '#ffffff',
      text: '#0f172a',
    },
    typography: {
      headingFont: 'Playfair Display',
      bodyFont: 'Georgia',
    },
    uiPatterns: ['article-hero', 'subscriber-count', 'issue-archive', 'author-byline', 'reading-time', 'share-buttons', 'subscribe-modal', 'paid-badge'],
    exampleApps: ['Substack', 'Ghost', 'Beehiiv', 'Medium', 'Revue'],
  },

  'portfolio-showcase': {
    id: 'portfolio-showcase',
    label: 'Portfolio & Showcase',
    labelRu: 'Портфолио',
    description: 'Personal portfolios, resumes, creative showcases',
    keywords: ['portfolio', 'resume', 'showcase', 'work', 'cv', 'портфолио', 'резюме', 'работы', 'проекты', 'визитка'],
    defaultStyle: 'editorial',
    allowedStyles: ['editorial', 'minimal-mono', 'dark-pro', 'glassmorphism', 'colorful-vibrant'],
    colorPalette: {
      primary: '#0f172a',
      secondary: '#475569',
      accent: '#6366f1',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#0f172a',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['project-grid', 'case-study-hero', 'skills-list', 'experience-timeline', 'testimonial-quote', 'contact-form', 'hover-preview', 'download-cv'],
    exampleApps: ['Behance', 'Dribbble', 'Read.cv', 'Layers.to', 'Framer Sites'],
  },

  'events-ticketing': {
    id: 'events-ticketing',
    label: 'Events & Ticketing',
    labelRu: 'Ивенты и билеты',
    description: 'Event management, ticketing, conferences',
    keywords: ['event', 'ticket', 'conference', 'meetup', 'concert', 'ивент', 'билет', 'конференция', 'митап', 'концерт'],
    defaultStyle: 'colorful-vibrant',
    allowedStyles: ['colorful-vibrant', 'dark-pro', 'editorial', 'glassmorphism', 'enterprise'],
    colorPalette: {
      primary: '#7c3aed',
      secondary: '#8b5cf6',
      accent: '#f59e0b',
      background: '#faf5ff',
      surface: '#ffffff',
      text: '#1e1b4b',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['event-hero', 'ticket-card', 'lineup-list', 'seat-map', 'countdown-timer', 'attendee-avatars', 'qr-ticket', 'schedule-grid'],
    exampleApps: ['Eventbrite', 'Luma', 'Ticketmaster', 'Hopin', 'Splash'],
  },

  // DEEP VERTICAL
  'logistics-delivery': {
    id: 'logistics-delivery',
    label: 'Logistics & Delivery',
    labelRu: 'Логистика и доставка',
    description: 'Logistics, delivery tracking, supply chain',
    keywords: ['logistics', 'delivery', 'shipping', 'track', 'supply', 'логистика', 'доставка', 'отслеживание', 'склад', 'маршрут'],
    defaultStyle: 'enterprise',
    allowedStyles: ['enterprise', 'clean-light', 'dark-pro', 'minimal-mono', 'colorful-vibrant'],
    colorPalette: {
      primary: '#f97316',
      secondary: '#fb923c',
      accent: '#0891b2',
      background: '#fff7ed',
      surface: '#ffffff',
      text: '#1c1917',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['tracking-map', 'delivery-status', 'route-list', 'package-card', 'driver-info', 'eta-badge', 'warehouse-grid', 'manifest-table'],
    exampleApps: ['FedEx', 'DHL', 'Onfleet', 'Routific', 'ShipBob'],
  },

  'legal-compliance': {
    id: 'legal-compliance',
    label: 'Legal & Compliance',
    labelRu: 'Юридические сервисы',
    description: 'Legal tools, contracts, compliance management',
    keywords: ['legal', 'contract', 'compliance', 'law', 'document', 'юрист', 'договор', 'комплаенс', 'закон', 'документ'],
    defaultStyle: 'enterprise',
    allowedStyles: ['enterprise', 'clean-light', 'minimal-mono', 'dark-pro', 'editorial'],
    colorPalette: {
      primary: '#1e3a5f',
      secondary: '#2563eb',
      accent: '#16a34a',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
    },
    typography: {
      headingFont: 'Georgia',
      bodyFont: 'Inter',
    },
    uiPatterns: ['document-list', 'signature-field', 'clause-editor', 'approval-workflow', 'risk-badge', 'deadline-alert', 'version-diff', 'audit-log'],
    exampleApps: ['DocuSign', 'Ironclad', 'ContractPodAi', 'Clio', 'LegalZoom'],
  },

  'construction-realty': {
    id: 'construction-realty',
    label: 'Construction & Realty',
    labelRu: 'Строительство',
    description: 'Construction management, project tracking, estimates',
    keywords: ['construction', 'build', 'estimate', 'contractor', 'site', 'строительство', 'стройка', 'смета', 'подрядчик', 'объект'],
    defaultStyle: 'enterprise',
    allowedStyles: ['enterprise', 'clean-light', 'dark-pro', 'minimal-mono', 'colorful-vibrant'],
    colorPalette: {
      primary: '#f59e0b',
      secondary: '#fbbf24',
      accent: '#0369a1',
      background: '#fffbeb',
      surface: '#ffffff',
      text: '#1c1917',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['project-timeline', 'cost-breakdown', 'site-photos', 'punch-list', 'subcontractor-list', 'progress-percentage', 'blueprint-viewer', 'rfi-card'],
    exampleApps: ['Procore', 'PlanGrid', 'Buildertrend', 'CoConstruct', 'Fieldwire'],
  },

  'agriculture-farm': {
    id: 'agriculture-farm',
    label: 'Agriculture & Farm',
    labelRu: 'Сельское хозяйство',
    description: 'Farm management, crop tracking, agriculture tools',
    keywords: ['farm', 'crop', 'agriculture', 'harvest', 'field', 'ферма', 'урожай', 'агро', 'поле', 'посев'],
    defaultStyle: 'warm-organic',
    allowedStyles: ['warm-organic', 'clean-light', 'enterprise', 'colorful-vibrant', 'minimal-mono'],
    colorPalette: {
      primary: '#16a34a',
      secondary: '#22c55e',
      accent: '#f59e0b',
      background: '#f0fdf4',
      surface: '#ffffff',
      text: '#052e16',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['field-map', 'crop-card', 'weather-widget', 'harvest-log', 'equipment-list', 'soil-sensor', 'yield-chart', 'task-schedule'],
    exampleApps: ['Granular', 'FarmLogs', 'Agrivi', 'Trimble Ag', 'Climate FieldView'],
  },

  'ngo-nonprofit': {
    id: 'ngo-nonprofit',
    label: 'NGO & Nonprofit',
    labelRu: 'НКО и некоммерческие',
    description: 'Nonprofit tools, donations, volunteer management',
    keywords: ['nonprofit', 'ngo', 'donate', 'volunteer', 'charity', 'нко', 'благотворительность', 'волонтёр', 'пожертвование', 'фонд'],
    defaultStyle: 'warm-organic',
    allowedStyles: ['warm-organic', 'clean-light', 'colorful-vibrant', 'editorial', 'enterprise'],
    colorPalette: {
      primary: '#0891b2',
      secondary: '#06b6d4',
      accent: '#f59e0b',
      background: '#f0fdff',
      surface: '#ffffff',
      text: '#0c4a6e',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['impact-counter', 'donation-form', 'campaign-progress', 'volunteer-card', 'story-highlight', 'donor-wall', 'event-calendar', 'report-download'],
    exampleApps: ['Classy', 'Donorbox', 'Kindful', 'Bloomerang', 'Salesforce Nonprofit'],
  },

  'gov-civic': {
    id: 'gov-civic',
    label: 'Gov & Civic',
    labelRu: 'Госсервисы и гражданские',
    description: 'Government services, civic tools, public sector',
    keywords: ['government', 'civic', 'public', 'citizen', 'service', 'госуслуги', 'гражданин', 'государство', 'муниципал', 'портал'],
    defaultStyle: 'enterprise',
    allowedStyles: ['enterprise', 'clean-light', 'minimal-mono', 'warm-organic', 'editorial'],
    colorPalette: {
      primary: '#1e40af',
      secondary: '#2563eb',
      accent: '#dc2626',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
    },
    typography: {
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
    uiPatterns: ['service-directory', 'form-wizard', 'status-tracker', 'document-upload', 'queue-number', 'faq-accordion', 'accessibility-toggle', 'official-seal'],
    exampleApps: ['GOV.UK', 'USDS', 'Госуслуги', 'Diia', 'Singapore MyInfo'],
  },
};

export function getCategoryMeta(id: CategoryId): CategoryMeta {
  return CATEGORIES[id];
}

export function getAllCategories(): CategoryMeta[] {
  return Object.values(CATEGORIES);
}

export function getCategoriesByStyle(style: StyleId): CategoryMeta[] {
  return Object.values(CATEGORIES).filter(c => c.allowedStyles.includes(style));
}
