-- Seed: Prototype Bank manifests
-- Run after prototype_bank.sql migration

-- ═══ ARCHETYPES ═══

INSERT INTO prototype_archetypes (id, name, description, manifest) VALUES
('consumer-feed', 'Consumer Feed', 'Лента контента с карточками, фильтрами и детальным просмотром', $json${
  "id": "consumer-feed",
  "type": "archetype",
  "name": "Consumer Feed",
  "description": "Лента контента с карточками, фильтрами и детальным просмотром",
  "whenToUse": ["Приложение с лентой событий/постов/товаров", "Социальный продукт", "Новостной агрегатор", "Маркетплейс с карточками"],
  "includes": ["Главная лента с бесконечной прокруткой", "Фильтры и категории", "Детальный экран элемента", "Bottom navigation"],
  "forbids": ["Sidebar navigation (используй BottomNav)", "Таблицы и grid-дашборды"],
  "routes": ["/", "/feed", "/detail/:id", "/profile"],
  "entities": ["FeedItem", "Category", "User"],
  "requiredModules": ["feed", "profile"],
  "optionalModules": ["auth", "search", "notifications"],
  "navigation": "bottom-tabs",
  "seedDataExample": {
    "items": [
      {"id": "1", "title": "Пример заголовка", "category": "Категория", "date": "2026-04-26"}
    ]
  }
}$json$::jsonb),

('dashboard-workspace', 'Dashboard Workspace', 'Рабочий дашборд с метриками, аналитикой и управлением', $json${
  "id": "dashboard-workspace",
  "type": "archetype",
  "name": "Dashboard Workspace",
  "description": "Рабочий дашборд с метриками, аналитикой и управлением",
  "whenToUse": ["B2B инструмент", "Аналитическая панель", "Трекер задач/продаж", "Административная панель"],
  "includes": ["KPI карточки с метриками", "Графики и аналитика", "Боковое меню (Sidebar)", "Таблицы данных", "Экран детальной аналитики"],
  "forbids": ["Bottom navigation", "Карточный feed-лейаут"],
  "routes": ["/", "/dashboard", "/analytics", "/settings"],
  "entities": ["Metric", "Report", "Task", "User"],
  "requiredModules": ["analytics"],
  "optionalModules": ["auth", "notifications", "settings"],
  "navigation": "sidebar",
  "seedDataExample": {
    "metrics": [
      {"id": "1", "label": "Выручка", "value": 142500, "change": 12.5, "trend": "up"},
      {"id": "2", "label": "Пользователи", "value": 3840, "change": 8.2, "trend": "up"},
      {"id": "3", "label": "Конверсия", "value": 4.7, "change": -0.3, "trend": "down"}
    ]
  }
}$json$::jsonb),

('scanner-app', 'Scanner App', 'Сканер/анализатор с историей результатов и детальными отчётами', $json${
  "id": "scanner-app",
  "type": "archetype",
  "name": "Scanner App",
  "description": "Сканер/анализатор с историей результатов и детальными отчётами",
  "whenToUse": ["Сканирование документов/штрихкодов", "Диагностика и анализ", "Медицинские измерения", "Проверка/валидация данных"],
  "includes": ["Главный экран сканирования", "Страница результатов анализа", "История сканирований", "Детальный просмотр результата"],
  "forbids": [],
  "routes": ["/", "/scan", "/result/:id", "/history"],
  "entities": ["Scan", "Result", "HistoryItem"],
  "requiredModules": [],
  "optionalModules": ["auth", "billing", "notifications"],
  "navigation": "bottom-tabs",
  "seedDataExample": {
    "history": [
      {"id": "1", "type": "QR Code", "result": "https://example.com", "date": "2026-04-26T10:30:00Z", "status": "success"},
      {"id": "2", "type": "Barcode", "result": "4607000400879", "date": "2026-04-25T15:45:00Z", "status": "success"}
    ]
  }
}$json$::jsonb),

('assistant-chat', 'Assistant Chat', 'Чат с AI-ассистентом, историей диалогов и настройками', $json${
  "id": "assistant-chat",
  "type": "archetype",
  "name": "Assistant Chat",
  "description": "Чат с AI-ассистентом, историей диалогов и настройками",
  "whenToUse": ["AI-инструмент или чат-бот", "Консультант или советник", "Генератор контента", "Диалоговый интерфейс"],
  "includes": ["Интерфейс чата с потоковым ответом", "История диалогов", "Настройки ассистента", "Пустое состояние с подсказками"],
  "forbids": [],
  "routes": ["/", "/chat", "/history", "/settings"],
  "entities": ["Message", "Conversation", "AssistantConfig"],
  "requiredModules": ["chat"],
  "optionalModules": ["auth", "billing"],
  "navigation": "bottom-tabs",
  "seedDataExample": {
    "conversations": [
      {"id": "1", "title": "Бизнес-план", "lastMessage": "Хорошо, вот структура...", "date": "2026-04-26"}
    ]
  }
}$json$::jsonb),

('superapp-shell', 'Superapp Shell', 'Мобильное супер-приложение с несколькими разделами и богатым home-экраном', $json${
  "id": "superapp-shell",
  "type": "archetype",
  "name": "Superapp Shell",
  "description": "Мобильное супер-приложение с несколькими разделами и богатым home-экраном",
  "whenToUse": ["Многофункциональное мобильное приложение", "Продукт с 3-5 основными разделами", "Super-app с разными функциями"],
  "includes": ["Home с featured контентом", "Explore/Discovery раздел", "Профиль пользователя", "TopBar с поиском", "BottomNav с 4 разделами"],
  "forbids": [],
  "routes": ["/", "/home", "/explore", "/profile", "/settings"],
  "entities": ["User", "Content", "Category"],
  "requiredModules": ["profile"],
  "optionalModules": ["auth", "feed", "search", "notifications"],
  "navigation": "bottom-tabs"
}$json$::jsonb)

ON CONFLICT (id) DO UPDATE SET manifest = EXCLUDED.manifest, updated_at = NOW();

-- ═══ DOMAINS ═══

INSERT INTO prototype_domains (id, name, manifest) VALUES
('medicine', 'Medicine', $json${
  "id": "medicine",
  "type": "domain",
  "name": "Medicine",
  "entities": ["Patient", "Doctor", "Appointment", "Diagnosis", "Prescription"],
  "roles": ["patient", "doctor", "admin"],
  "typicalFlows": ["Запись на приём", "Просмотр истории болезни", "Получение результатов анализов", "Видеоконсультация"],
  "restrictions": ["Никаких ярких агрессивных цветов в основном UI", "Всегда показывать дисклеймер о профессиональной консультации", "Данные пациентов — только с подтверждением согласия"],
  "uiPatterns": ["Карточки с иконками медицинских специальностей", "Временная шкала для истории лечения", "Прогресс-индикаторы", "Цветовое кодирование статусов (зелёный/жёлтый/красный)"],
  "recommendedDesign": "trust-medical",
  "recommendedArchetypes": ["dashboard-workspace", "scanner-app"]
}$json$::jsonb),

('fintech', 'Fintech', $json${
  "id": "fintech",
  "type": "domain",
  "name": "Fintech",
  "entities": ["Account", "Transaction", "Budget", "Goal", "Card"],
  "roles": ["user", "admin"],
  "typicalFlows": ["Перевод средств", "История транзакций", "Управление бюджетом", "Накопительные цели"],
  "restrictions": ["Всегда показывать реальные суммы в seed data (не round numbers)", "Цветовое разделение доходов (+green) и расходов (-red)", "Маскировка чувствительных данных (карта: ****1234)"],
  "uiPatterns": ["Баланс крупным шрифтом на главном экране", "Список транзакций с иконками категорий", "Кольцевые/столбчатые графики бюджета", "Прогресс-бары накоплений"],
  "recommendedDesign": "dark-premium",
  "recommendedArchetypes": ["dashboard-workspace"]
}$json$::jsonb),

('gaming', 'Gaming', $json${
  "id": "gaming",
  "type": "domain",
  "name": "Gaming",
  "entities": ["Player", "Game", "Score", "Achievement", "Leaderboard"],
  "roles": ["player"],
  "typicalFlows": ["Начать игру/сессию", "Просмотр таблицы лидеров", "Открытие достижений", "Просмотр статистики"],
  "restrictions": [],
  "uiPatterns": ["Яркие неоновые акценты", "Анимации и переходы", "XP прогресс-бары", "Аватары игроков", "Значки и трофеи"],
  "recommendedDesign": "neon-dark",
  "recommendedArchetypes": ["superapp-shell", "consumer-feed"]
}$json$::jsonb),

('wellness', 'Wellness', $json${
  "id": "wellness",
  "type": "domain",
  "name": "Wellness",
  "entities": ["Session", "Habit", "Progress", "Goal", "Mood"],
  "roles": ["user"],
  "typicalFlows": ["Начать медитацию/тренировку", "Трекинг привычек", "Просмотр прогресса за период", "Добавить запись настроения"],
  "restrictions": [],
  "uiPatterns": ["Спокойные пастельные или приглушённые градиенты", "Прогресс-кольца и streak-счётчики", "Мотивирующие цитаты", "Тёплые иллюстрации"],
  "recommendedDesign": "light-clean",
  "recommendedArchetypes": ["consumer-feed", "superapp-shell"]
}$json$::jsonb),

('social', 'Social', $json${
  "id": "social",
  "type": "domain",
  "name": "Social",
  "entities": ["User", "Post", "Comment", "Like", "Follow", "Story"],
  "roles": ["user"],
  "typicalFlows": ["Публикация поста/фото", "Просмотр ленты", "Взаимодействие (лайк/комментарий)", "Просмотр профиля"],
  "restrictions": [],
  "uiPatterns": ["Аватары и имена пользователей везде", "Счётчики лайков/комментариев", "Stories в горизонтальной прокрутке", "Кнопки follow/unfollow"],
  "recommendedDesign": "dark-premium",
  "recommendedArchetypes": ["consumer-feed", "superapp-shell"]
}$json$::jsonb),

('ai-tools', 'AI Tools', $json${
  "id": "ai-tools",
  "type": "domain",
  "name": "AI Tools",
  "entities": ["Prompt", "Result", "Template", "History", "Collection"],
  "roles": ["user"],
  "typicalFlows": ["Ввод запроса и получение результата", "Выбор из шаблонов", "Сохранение в коллекцию", "История запросов"],
  "restrictions": ["Всегда показывать анимированный индикатор при генерации", "Не показывать технические ID моделей пользователю"],
  "uiPatterns": ["Textarea с плейсхолдером-примером", "Карточки шаблонов с категориями", "Анимация потоковой генерации", "Кнопки копирования результатов"],
  "recommendedDesign": "dark-premium",
  "recommendedArchetypes": ["assistant-chat", "scanner-app"]
}$json$::jsonb)

ON CONFLICT (id) DO UPDATE SET manifest = EXCLUDED.manifest;

-- ═══ MODULES ═══

INSERT INTO prototype_modules (id, name, manifest) VALUES
('auth', 'Authentication', $json${
  "id": "auth",
  "type": "module",
  "name": "Authentication",
  "description": "Google OAuth + email/password через Supabase",
  "adds": ["AuthModal компонент", "useAuth hook", "AuthProvider", "Защита роутов (PrivateRoute)"],
  "routes": ["/login", "/signup"],
  "entities": ["User", "Session"],
  "dependencies": ["@supabase/supabase-js"]
}$json$::jsonb),

('billing', 'Billing / Paywall', $json${
  "id": "billing",
  "type": "module",
  "name": "Billing / Paywall",
  "description": "Paywall с тремя тарифами и управлением подпиской",
  "adds": ["PaywallModal компонент", "PricingCard компонент", "useSubscription hook"],
  "routes": ["/pricing"],
  "entities": ["Plan", "Subscription"],
  "dependencies": []
}$json$::jsonb),

('onboarding', 'Onboarding', $json${
  "id": "onboarding",
  "type": "module",
  "name": "Onboarding",
  "description": "3-шаговый онбординг с выбором параметров при первом запуске",
  "adds": ["OnboardingWizard компонент", "OnboardingStep компонент", "useOnboarding hook"],
  "routes": ["/onboarding"],
  "entities": ["UserPreferences"],
  "dependencies": []
}$json$::jsonb),

('analytics', 'Analytics', $json${
  "id": "analytics",
  "type": "module",
  "name": "Analytics",
  "description": "Графики и метрики через recharts",
  "adds": ["LineChart компонент", "BarChart компонент", "KPICard компонент", "MetricsSummary компонент"],
  "routes": ["/analytics"],
  "entities": ["Metric", "DataPoint"],
  "dependencies": ["recharts"]
}$json$::jsonb),

('feed', 'Feed', $json${
  "id": "feed",
  "type": "module",
  "name": "Feed",
  "description": "Лента контента с фильтрами и бесконечной прокруткой",
  "adds": ["FeedList компонент", "FeedCard компонент", "FeedFilters компонент"],
  "routes": ["/feed"],
  "entities": ["FeedItem", "Category"],
  "dependencies": []
}$json$::jsonb),

('chat', 'Chat', $json${
  "id": "chat",
  "type": "module",
  "name": "Chat",
  "description": "Чат интерфейс с историей сообщений",
  "adds": ["ChatView компонент", "MessageBubble компонент", "ChatInput компонент"],
  "routes": ["/chat"],
  "entities": ["Message", "Conversation"],
  "dependencies": []
}$json$::jsonb),

('search', 'Search & Filter', $json${
  "id": "search",
  "type": "module",
  "name": "Search & Filter",
  "description": "Поиск и фильтрация контента",
  "adds": ["SearchBar компонент", "FilterPanel компонент", "useSearch hook"],
  "routes": [],
  "entities": [],
  "dependencies": []
}$json$::jsonb),

('profile', 'User Profile', $json${
  "id": "profile",
  "type": "module",
  "name": "User Profile",
  "description": "Профиль пользователя с настройками и статистикой",
  "adds": ["ProfilePage компонент", "AvatarUpload компонент", "ProfileStats компонент"],
  "routes": ["/profile"],
  "entities": ["UserProfile"],
  "dependencies": []
}$json$::jsonb),

('notifications', 'Notifications', $json${
  "id": "notifications",
  "type": "module",
  "name": "Notifications",
  "description": "Push и in-app уведомления",
  "adds": ["NotificationCenter компонент", "NotificationItem компонент", "usePushNotifications hook"],
  "routes": ["/notifications"],
  "entities": ["Notification"],
  "dependencies": []
}$json$::jsonb),

('settings', 'Settings', $json${
  "id": "settings",
  "type": "module",
  "name": "Settings",
  "description": "Настройки приложения и профиля",
  "adds": ["SettingsPage компонент", "SettingsSection компонент", "ToggleSetting компонент"],
  "routes": ["/settings"],
  "entities": ["AppSettings"],
  "dependencies": []
}$json$::jsonb)

ON CONFLICT (id) DO UPDATE SET manifest = EXCLUDED.manifest;

-- ═══ DESIGN PACKS ═══

INSERT INTO prototype_design_packs (id, name, pack_type, manifest) VALUES
('foundation', 'Design Foundation', 'foundation', $json${
  "id": "foundation",
  "type": "design-foundation",
  "name": "Design Foundation",
  "description": "Базовые токены дизайна: типографика, сетка, радиусы, тени",
  "tokens": {
    "fontFamily": "Inter, system-ui, sans-serif",
    "baseFontSize": "16px",
    "gridColumns": 4,
    "gridGutter": "16px",
    "borderRadiusSm": "8px",
    "borderRadiusMd": "12px",
    "borderRadiusLg": "16px",
    "shadowSm": "0 1px 3px rgba(0,0,0,0.12)",
    "shadowMd": "0 4px 16px rgba(0,0,0,0.16)",
    "transitionFast": "150ms ease",
    "transitionBase": "250ms ease"
  }
}$json$::jsonb),

('dark-premium', 'Dark Premium', 'surface', $json${
  "id": "dark-premium",
  "type": "surface-pack",
  "name": "Dark Premium",
  "description": "Тёмный премиальный интерфейс с фиолетовыми/синими акцентами",
  "colors": {
    "background": "#07070b",
    "surface": "#0d0d12",
    "surfaceAlt": "#131318",
    "border": "rgba(255,255,255,0.07)",
    "text": "#e5e5ea",
    "textMuted": "#6b6b7a",
    "accent": "#a78bfa",
    "accentFg": "#ffffff",
    "success": "#4ade80",
    "warning": "#fbbf24",
    "danger": "#f87171"
  },
  "mood": "luxury",
  "suitableDomains": ["fintech", "ai-tools", "social", "gaming"]
}$json$::jsonb),

('light-clean', 'Light Clean', 'surface', $json${
  "id": "light-clean",
  "type": "surface-pack",
  "name": "Light Clean",
  "description": "Светлый минималистичный интерфейс для wellness и productivity",
  "colors": {
    "background": "#fafafa",
    "surface": "#ffffff",
    "surfaceAlt": "#f4f4f5",
    "border": "rgba(0,0,0,0.08)",
    "text": "#18181b",
    "textMuted": "#71717a",
    "accent": "#6366f1",
    "accentFg": "#ffffff",
    "success": "#22c55e",
    "warning": "#f59e0b",
    "danger": "#ef4444"
  },
  "mood": "calm",
  "suitableDomains": ["wellness", "medicine", "productivity"]
}$json$::jsonb),

('neon-dark', 'Neon Dark', 'surface', $json${
  "id": "neon-dark",
  "type": "surface-pack",
  "name": "Neon Dark",
  "description": "Тёмный интерфейс с яркими неоновыми акцентами для gaming и entertainment",
  "colors": {
    "background": "#050508",
    "surface": "#0a0a0f",
    "surfaceAlt": "#0f0f18",
    "border": "rgba(139,92,246,0.15)",
    "text": "#f4f4f5",
    "textMuted": "#71717a",
    "accent": "#8b5cf6",
    "accentSecondary": "#06b6d4",
    "accentFg": "#ffffff",
    "success": "#4ade80",
    "warning": "#fbbf24",
    "danger": "#f87171"
  },
  "mood": "energetic",
  "suitableDomains": ["gaming", "entertainment", "ai-tools"]
}$json$::jsonb),

('trust-medical', 'Trust Medical', 'surface', $json${
  "id": "trust-medical",
  "type": "surface-pack",
  "name": "Trust Medical",
  "description": "Профессиональный медицинский интерфейс: нейтральные цвета, высокая читаемость",
  "colors": {
    "background": "#f0f4f8",
    "surface": "#ffffff",
    "surfaceAlt": "#e8f0fe",
    "border": "rgba(0,0,0,0.1)",
    "text": "#1a202c",
    "textMuted": "#718096",
    "accent": "#3182ce",
    "accentFg": "#ffffff",
    "success": "#38a169",
    "warning": "#d69e2e",
    "danger": "#e53e3e"
  },
  "mood": "professional",
  "suitableDomains": ["medicine", "healthcare", "insurance"]
}$json$::jsonb),

('gaming-visual', 'Gaming Visual Pack', 'domain', $json${
  "id": "gaming-visual",
  "type": "domain-visual-pack",
  "name": "Gaming Visual Pack",
  "description": "Визуальный язык для игровых приложений",
  "basedOn": "neon-dark",
  "additions": {
    "xpBar": "gradient from accent to accentSecondary",
    "achievementBadge": "gold/silver/bronze with glow",
    "leaderboardRow": "rank number with crown for top-3"
  }
}$json$::jsonb),

('medical-visual', 'Medical Visual Pack', 'domain', $json${
  "id": "medical-visual",
  "type": "domain-visual-pack",
  "name": "Medical Visual Pack",
  "description": "Визуальный язык для медицинских приложений",
  "basedOn": "trust-medical",
  "additions": {
    "statusIndicator": "green/yellow/red for health status",
    "timeline": "vertical timeline for medical history",
    "disclaimer": "always visible disclaimer banner"
  }
}$json$::jsonb),

('fintech-visual', 'Fintech Visual Pack', 'domain', $json${
  "id": "fintech-visual",
  "type": "domain-visual-pack",
  "name": "Fintech Visual Pack",
  "description": "Визуальный язык для финансовых приложений",
  "basedOn": "dark-premium",
  "additions": {
    "incomeColor": "#4ade80",
    "expenseColor": "#f87171",
    "balanceFont": "tabular-nums, 2rem, font-bold",
    "cardMask": "•••• •••• •••• XXXX"
  }
}$json$::jsonb)

ON CONFLICT (id) DO UPDATE SET manifest = EXCLUDED.manifest;

-- ═══ CORE LAYER ═══

INSERT INTO prototype_core (id, manifest) VALUES
('core', $json${
  "id": "core",
  "type": "core",
  "name": "Core Layer",
  "description": "Обязательный фундамент каждого приложения. Всегда присутствует.",
  "alwaysIncluded": true,
  "components": {
    "onboarding": {
      "description": "3-шаговый онбординг при первом запуске",
      "trigger": "localStorage 'onboarding_complete' !== 'true'",
      "steps": ["Приветствие + ценностное предложение", "Выбор предпочтений пользователя", "Создание профиля или пропуск"],
      "completionEvent": "window.dispatchEvent(new CustomEvent('onboarding-complete'))",
      "storageKey": "onboarding_complete"
    },
    "paywall": {
      "description": "Монетизация после N бесплатных действий",
      "trigger": "usageCount >= FREE_LIMIT && !isPremium",
      "plans": [
        {"id": "basic", "price": "$4.99/mo", "features": ["core features"]},
        {"id": "pro", "price": "$9.99/mo", "features": ["all features"]},
        {"id": "premium", "price": "$19.99/mo", "features": ["everything + priority"]}
      ],
      "storageKey": "is_premium",
      "freeLimit": 3
    },
    "auth": {
      "description": "Google OAuth через Supabase",
      "provider": "google",
      "optional": true,
      "note": "Авторизация необязательна для базового использования"
    },
    "account": {
      "description": "Настройки аккаунта и профиля",
      "sections": ["Профиль (имя, аватар)", "Подписка (текущий план, управление)", "Язык и регион", "Уведомления", "Данные (экспорт, удаление аккаунта)"],
      "route": "/account"
    },
    "i18n": {
      "description": "Мультиязычность ru/en",
      "defaultLanguage": "ru",
      "supportedLanguages": ["ru", "en"],
      "detectionOrder": ["localStorage 'app_language'", "navigator.language", "default: ru"]
    }
  },
  "routes": ["/onboarding", "/account", "/paywall"],
  "storageKeys": ["onboarding_complete", "is_premium", "usage_count", "app_language", "user_profile"],
  "navigationGuards": [
    "/ → /onboarding если onboarding_complete !== true",
    "/premium-feature → /paywall если !isPremium && usageCount >= FREE_LIMIT"
  ]
}$json$::jsonb)

ON CONFLICT (id) DO UPDATE SET manifest = EXCLUDED.manifest, updated_at = NOW();
