export type Language = 'ru' | 'en';

export interface Translations {
  // Common
  appName: string;
  save: string;
  cancel: string;
  delete: string;
  edit: string;
  create: string;
  search: string;
  loading: string;
  noResults: string;
  actions: string;
  status: string;
  active: string;
  inactive: string;
  draft: string;
  all: string;
  back: string;
  next: string;
  close: string;
  confirm: string;
  
  // Navigation
  dashboard: string;
  workflows: string;
  builder: string;
  analytics: string;
  settings: string;
  
  // Dashboard
  welcomeBack: string;
  dashboardSubtitle: string;
  hoursSaved: string;
  hoursSavedDesc: string;
  activeWorkflows: string;
  activeWorkflowsDesc: string;
  tasksAutomated: string;
  tasksAutomatedDesc: string;
  successRate: string;
  successRateDesc: string;
  thisMonth: string;
  quickActions: string;
  createWorkflow: string;
  viewAnalytics: string;
  teamLeaderboard: string;
  member: string;
  saved: string;
  streak: string;
  days: string;
  recentActivity: string;
  noRecentActivity: string;
  
  // Workflows
  workflowList: string;
  createNewWorkflow: string;
  searchWorkflows: string;
  filterByStatus: string;
  executions: string;
  lastRun: string;
  editWorkflow: string;
  deleteWorkflow: string;
  noWorkflows: string;
  noWorkflowsDesc: string;
  confirmDelete: string;
  workflowName: string;
  workflowDescription: string;
  created: string;
  
  // Builder
  workflowBuilder: string;
  saveWorkflow: string;
  publishWorkflow: string;
  nodePalette: string;
  canvas: string;
  properties: string;
  triggers: string;
  actions: string;
  aiAgent: string;
  condition: string;
  emailTrigger: string;
  webhookTrigger: string;
  scheduleTrigger: string;
  formTrigger: string;
  sendEmail: string;
  httpRequest: string;
  updateCRM: string;
  sendSlack: string;
  createTask: string;
  generateDocument: string;
  analyzeData: string;
  extractInfo: string;
  nodeName: string;
  nodeDescription: string;
  nodeSettings: string;
  selectNode: string;
  selectNodeDesc: string;
  deleteNode: string;
  connectTo: string;
  noConnections: string;
  dropHere: string;
  dropHereDesc: string;
  clearCanvas: string;
  
  // Analytics
  analyticsTitle: string;
  analyticsSubtitle: string;
  usageOverTime: string;
  costBreakdown: string;
  topWorkflows: string;
  performanceMetrics: string;
  totalExecutions: string;
  avgResponseTime: string;
  errorRate: string;
  costPerExecution: string;
  openaiCosts: string;
  infrastructureCosts: string;
  totalCost: string;
  weekly: string;
  monthly: string;
  quarterly: string;
  
  // Settings
  settingsTitle: string;
  settingsSubtitle: string;
  language: string;
  languageDesc: string;
  russian: string;
  english: string;
  subscription: string;
  subscriptionDesc: string;
  currentPlan: string;
  freePlan: string;
  proPlan: string;
  upgrade: string;
  manageBilling: string;
  apiKeys: string;
  apiKeysDesc: string;
  addApiKey: string;
  apiKeyName: string;
  apiKeyValue: string;
  teamManagement: string;
  teamManagementDesc: string;
  inviteMember: string;
  email: string;
  role: string;
  owner: string;
  admin: string;
  member2: string;
  remove: string;
  notifications: string;
  notificationsDesc: string;
  emailNotifications: string;
  slackNotifications: string;
  executionAlerts: string;
  weeklyReport: string;
  
  // Subscription limits
  freePlanLimit: string;
  proPlanLimit: string;
  workflowsUsed: string;
  
  // Time
  today: string;
  yesterday: string;
  daysAgo: string;
  hoursAgo: string;
  minutesAgo: string;
  justNow: string;
}

export const translations: Record<Language, Translations> = {
  ru: {
    appName: 'AgentFlow',
    save: 'Сохранить',
    cancel: 'Отмена',
    delete: 'Удалить',
    edit: 'Редактировать',
    create: 'Создать',
    search: 'Поиск',
    loading: 'Загрузка...',
    noResults: 'Ничего не найдено',
    actions: 'Действия',
    status: 'Статус',
    active: 'Активен',
    inactive: 'Неактивен',
    draft: 'Черновик',
    all: 'Все',
    back: 'Назад',
    next: 'Далее',
    close: 'Закрыть',
    confirm: 'Подтвердить',
    
    dashboard: 'Панель управления',
    workflows: 'Воркфлоу',
    builder: 'Конструктор',
    analytics: 'Аналитика',
    settings: 'Настройки',
    
    welcomeBack: 'С возвращением, команда!',
    dashboardSubtitle: 'Вот что происходит с вашими автоматизациями',
    hoursSaved: 'Часов сэкономлено',
    hoursSavedDesc: 'за этот месяц',
    activeWorkflows: 'Активных воркфлоу',
    activeWorkflowsDesc: 'из всех созданных',
    tasksAutomated: 'Задач автоматизировано',
    tasksAutomatedDesc: 'за последние 30 дней',
    successRate: 'Успешность',
    successRateDesc: 'выполнений без ошибок',
    thisMonth: 'в этом месяце',
    quickActions: 'Быстрые действия',
    createWorkflow: 'Создать воркфлоу',
    viewAnalytics: 'Смотреть аналитику',
    teamLeaderboard: 'Рейтинг команды',
    member: 'Участник',
    saved: 'Сэкономил',
    streak: 'Серия',
    days: 'дн.',
    recentActivity: 'Последняя активность',
    noRecentActivity: 'Активности пока нет',
    
    workflowList: 'Список воркфлоу',
    createNewWorkflow: 'Создать воркфлоу',
    searchWorkflows: 'Поиск воркфлоу...',
    filterByStatus: 'Фильтр по статусу',
    executions: 'Выполнений',
    lastRun: 'Последний запуск',
    editWorkflow: 'Редактировать',
    deleteWorkflow: 'Удалить',
    noWorkflows: 'Воркфлоу не найдены',
    noWorkflowsDesc: 'Создайте свой первый воркфлоу, чтобы начать автоматизацию',
    confirmDelete: 'Вы уверены, что хотите удалить это воркфлоу?',
    workflowName: 'Название воркфлоу',
    workflowDescription: 'Описание',
    created: 'Создано',
    
    workflowBuilder: 'Конструктор воркфлоу',
    saveWorkflow: 'Сохранить',
    publishWorkflow: 'Опубликовать',
    nodePalette: 'Палитра узлов',
    canvas: 'Холст',
    properties: 'Свойства',
    triggers: 'Триггеры',
    actions: 'Действия',
    aiAgent: 'AI Агент',
    condition: 'Условие',
    emailTrigger: 'Email триггер',
    webhookTrigger: 'Webhook',
    scheduleTrigger: 'По расписанию',
    formTrigger: 'Форма',
    sendEmail: 'Отправить Email',
    httpRequest: 'HTTP запрос',
    updateCRM: 'Обновить CRM',
    sendSlack: 'Отправить в Slack',
    createTask: 'Создать задачу',
    generateDocument: 'Генерация документа',
    analyzeData: 'Анализ данных',
    extractInfo: 'Извлечь информацию',
    nodeName: 'Название узла',
    nodeDescription: 'Описание узла',
    nodeSettings: 'Настройки узла',
    selectNode: 'Выберите узел',
    selectNodeDesc: 'Кликните на узел на холсте для редактирования его свойств',
    deleteNode: 'Удалить узел',
    connectTo: 'Подключить к',
    noConnections: 'Нет соединений',
    dropHere: 'Перетащите узлы сюда',
    dropHereDesc: 'Используйте палитру слева для добавления узлов на холст',
    clearCanvas: 'Очистить холст',
    
    analyticsTitle: 'Аналитика',
    analyticsSubtitle: 'Отслеживайте эффективность ваших автоматизаций',
    usageOverTime: 'Использование во времени',
    costBreakdown: 'Разбивка затрат',
    topWorkflows: 'Топ воркфлоу',
    performanceMetrics: 'Метрики производительности',
    totalExecutions: 'Всего выполнений',
    avgResponseTime: 'Среднее время ответа',
    errorRate: 'Частота ошибок',
    costPerExecution: 'Стоимость выполнения',
    openaiCosts: 'OpenAI',
    infrastructureCosts: 'Инфраструктура',
    totalCost: 'Итого',
    weekly: 'Неделя',
    monthly: 'Месяц',
    quarterly: 'Квартал',
    
    settingsTitle: 'Настройки',
    settingsSubtitle: 'Управляйте своим аккаунтом и предпочтениями',
    language: 'Язык',
    languageDesc: 'Выберите язык интерфейса',
    russian: 'Русский',
    english: 'English',
    subscription: 'Подписка',
    subscriptionDesc: 'Управляйте своим тарифным планом',
    currentPlan: 'Текущий план',
    freePlan: 'Бесплатный',
    proPlan: 'Профессиональный',
    upgrade: 'Обновить',
    manageBilling: 'Управление оплатой',
    apiKeys: 'API ключи',
    apiKeysDesc: 'Управляйте ключами доступа к API',
    addApiKey: 'Добавить ключ',
    apiKeyName: 'Название ключа',
    apiKeyValue: 'Значение ключа',
    teamManagement: 'Управление командой',
    teamManagementDesc: 'Приглашайте и управляйте участниками',
    inviteMember: 'Пригласить участника',
    email: 'Email',
    role: 'Роль',
    owner: 'Владелец',
    admin: 'Администратор',
    member2: 'Участник',
    remove: 'Удалить',
    notifications: 'Уведомления',
    notificationsDesc: 'Настройте оповещения',
    emailNotifications: 'Email уведомления',
    slackNotifications: 'Slack уведомления',
    executionAlerts: 'Оповещения о выполнении',
    weeklyReport: 'Еженедельный отчёт',
    
    freePlanLimit: 'до 5 воркфлоу',
    proPlanLimit: 'без ограничений',
    workflowsUsed: 'воркфлоу использовано',
    
    today: 'Сегодня',
    yesterday: 'Вчера',
    daysAgo: 'дн. назад',
    hoursAgo: 'ч. назад',
    minutesAgo: 'мин. назад',
    justNow: 'Только что',
  },
  en: {
    appName: 'AgentFlow',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    search: 'Search',
    loading: 'Loading...',
    noResults: 'No results found',
    actions: 'Actions',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    draft: 'Draft',
    all: 'All',
    back: 'Back',
    next: 'Next',
    close: 'Close',
    confirm: 'Confirm',
    
    dashboard: 'Dashboard',
    workflows: 'Workflows',
    builder: 'Builder',
    analytics: 'Analytics',
    settings: 'Settings',
    
    welcomeBack: 'Welcome back, team!',
    dashboardSubtitle: "Here's what's happening with your automations",
    hoursSaved: 'Hours Saved',
    hoursSavedDesc: 'this month',
    activeWorkflows: 'Active Workflows',
    activeWorkflowsDesc: 'of all created',
    tasksAutomated: 'Tasks Automated',
    tasksAutomatedDesc: 'in the last 30 days',
    successRate: 'Success Rate',
    successRateDesc: 'executions without errors',
    thisMonth: 'this month',
    quickActions: 'Quick Actions',
    createWorkflow: 'Create Workflow',
    viewAnalytics: 'View Analytics',
    teamLeaderboard: 'Team Leaderboard',
    member: 'Member',
    saved: 'Saved',
    streak: 'Streak',
    days: 'days',
    recentActivity: 'Recent Activity',
    noRecentActivity: 'No activity yet',
    
    workflowList: 'Workflow List',
    createNewWorkflow: 'Create Workflow',
    searchWorkflows: 'Search workflows...',
    filterByStatus: 'Filter by status',
    executions: 'Executions',
    lastRun: 'Last run',
    editWorkflow: 'Edit',
    deleteWorkflow: 'Delete',
    noWorkflows: 'No workflows found',
    noWorkflowsDesc: 'Create your first workflow to start automating',
    confirmDelete: 'Are you sure you want to delete this workflow?',
    workflowName: 'Workflow name',
    workflowDescription: 'Description',
    created: 'Created',
    
    workflowBuilder: 'Workflow Builder',
    saveWorkflow: 'Save',
    publishWorkflow: 'Publish',
    nodePalette: 'Node Palette',
    canvas: 'Canvas',
    properties: 'Properties',
    triggers: 'Triggers',
    actions: 'Actions',
    aiAgent: 'AI Agent',
    condition: 'Condition',
    emailTrigger: 'Email Trigger',
    webhookTrigger: 'Webhook',
    scheduleTrigger: 'Schedule',
    formTrigger: 'Form',
    sendEmail: 'Send Email',
    httpRequest: 'HTTP Request',
    updateCRM: 'Update CRM',
    sendSlack: 'Send to Slack',
    createTask: 'Create Task',
    generateDocument: 'Generate Document',
    analyzeData: 'Analyze Data',
    extractInfo: 'Extract Information',
    nodeName: 'Node name',
    nodeDescription: 'Node description',
    nodeSettings: 'Node settings',
    selectNode: 'Select a node',
    selectNodeDesc: 'Click on a node on the canvas to edit its properties',
    deleteNode: 'Delete node',
    connectTo: 'Connect to',
    noConnections: 'No connections',
    dropHere: 'Drop nodes here',
    dropHereDesc: 'Use the palette on the left to add nodes to the canvas',
    clearCanvas: 'Clear canvas',
    
    analyticsTitle: 'Analytics',
    analyticsSubtitle: 'Track your automation performance',
    usageOverTime: 'Usage Over Time',
    costBreakdown: 'Cost Breakdown',
    topWorkflows: 'Top Workflows',
    performanceMetrics: 'Performance Metrics',
    totalExecutions: 'Total Executions',
    avgResponseTime: 'Avg Response Time',
    errorRate: 'Error Rate',
    costPerExecution: 'Cost per Execution',
    openaiCosts: 'OpenAI',
    infrastructureCosts: 'Infrastructure',
    totalCost: 'Total',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    
    settingsTitle: 'Settings',
    settingsSubtitle: 'Manage your account and preferences',
    language: 'Language',
    languageDesc: 'Choose interface language',
    russian: 'Русский',
    english: 'English',
    subscription: 'Subscription',
    subscriptionDesc: 'Manage your billing plan',
    currentPlan: 'Current Plan',
    freePlan: 'Free',
    proPlan: 'Professional',
    upgrade: 'Upgrade',
    manageBilling: 'Manage Billing',
    apiKeys: 'API Keys',
    apiKeysDesc: 'Manage your API access keys',
    addApiKey: 'Add Key',
    apiKeyName: 'Key name',
    apiKeyValue: 'Key value',
    teamManagement: 'Team Management',
    teamManagementDesc: 'Invite and manage team members',
    inviteMember: 'Invite Member',
    email: 'Email',
    role: 'Role',
    owner: 'Owner',
    admin: 'Admin',
    member2: 'Member',
    remove: 'Remove',
    notifications: 'Notifications',
    notificationsDesc: 'Configure your alerts',
    emailNotifications: 'Email notifications',
    slackNotifications: 'Slack notifications',
    executionAlerts: 'Execution alerts',
    weeklyReport: 'Weekly report',
    
    freePlanLimit: 'up to 5 workflows',
    proPlanLimit: 'unlimited',
    workflowsUsed: 'workflows used',
    
    today: 'Today',
    yesterday: 'Yesterday',
    daysAgo: 'days ago',
    hoursAgo: 'hours ago',
    minutesAgo: 'minutes ago',
    justNow: 'Just now',
  },
};