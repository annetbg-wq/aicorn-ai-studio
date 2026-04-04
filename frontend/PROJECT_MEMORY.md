# AIC-RG Studio — Project Memory v4
**Дата:** 03.04.2026 | **Статус:** Активная разработка

---

## ЧТО ЭТО

AI-студия для генерации полноценных React-приложений по текстовому описанию.
Цель: превзойти Lovable по качеству генерируемых продуктов и глубине архитектурного мышления.

---

## КАНОНИЧЕСКИЙ ПУТЬ ГЕНЕРАЦИИ (единственный продовый)

```
Пользователь → чат / WeeklyFeedPanel
  → SimpleGeneration.run()
    → Architect LLM (plan JSON с thinking)
    → Coder LLM (FILE маркеры)
    → parseFileMarkers() → llmFiles
    → writePreviewFile() × N → preview-app/src/
    → Vite HMR (порт 3100) подхватывает
    → force-preview-reload → SandpackPreview перезагружает iframe
    → ProjectRepository.saveProject() → Supabase user_projects
```

**Всё остальное — не продовый путь:**
- `Orchestrator.ts` — только `applyOperations()` для edit mode
- `AgentLoopService` — только AgentLab панель
- `Figma/PlatinumFigma` — изолирован, не трогает preview-app
- `storageService` — только sync метрик, не проекты

---

## ХРАНЕНИЕ ДАННЫХ

| Что | Где | Зачем |
|-----|-----|-------|
| Файлы проекта (source of truth) | Supabase `user_projects.code_snapshot` | Персистентность, мульти-устройство |
| Метаданные проектов (кэш) | localStorage `aic_projects_meta` | Быстрый список без сетевого запроса |
| API ключи, настройки агентов | localStorage через ConfigService | Локальные настройки |
| Billing per project | localStorage `BILLING_{id}` | Подсчёт токенов |
| preview-app/src/ | Файловая система (временно) | Рабочая директория Vite, НЕ хранилище |

**Правило:** localStorage = кэш. Supabase = правда.

---

## СТЕК

**Studio (frontend/):**
- React 18 + TypeScript + Vite (порт 5183)
- Tailwind CSS + shadcn/ui
- Supabase JS client (`@supabase/supabase-js`)
- lucide-react иконки

**Preview (preview-app/):**
- React 18 + TypeScript + Vite (порт 3100)
- Tailwind CSS + shadcn/ui (19 компонентов — НЕ ТРОГАТЬ)
- 5 CSS тем: dark-slate, trust, warm, neon, bloom

**Backend:**
- Supabase (PostgreSQL + RLS)
- Таблицы: `user_projects`, `studio_manifest`, `agent_sessions`, `user_config`, `benchmark_baselines`
- Edge Functions: `llm-proxy`, `figma-proxy`

---

## КЛЮЧЕВЫЕ ФАЙЛЫ

| Файл | Роль |
|------|------|
| `services/SimpleGeneration.ts` | Ядро — единственный путь генерации |
| `services/ProjectRepository.ts` | Единственный сервис для работы с проектами |
| `hooks/useStudio.ts` | Главный стейт, вызывает SimpleGeneration и ProjectRepository |
| `components/SandpackPreview.tsx` | Preview display layer, оба iframe ВСЕГДА в DOM |
| `components/PreviewCanvas.tsx` | Контейнер preview + вкладки |
| `services/ConfigService.ts` | Все настройки и ключи |
| `lib/supabase.ts` | Supabase singleton client |
| `hooks/useProjectSync.ts` | Авто-sync метрик в Supabase |

---

## АГЕНТЫ И МОДЕЛИ

Пользователь выбирает модель для каждого слота в Settings → Engine.
**Никогда не захардкоживать модели в коде.**

| Слот | Где используется |
|------|-----------------|
| `primary` | Architect (проектирует план), Vision intake |
| `build` | Coder (генерирует код), React Native export |
| `fix` | AutoFix ошибок, App Store тексты |
| `spec` | AgentLab spec, Vision analysis |
| `qa` | AgentLab QA |

Получение: `ConfigService.resolveModel(slot)` + `ConfigService.getKeyForAgent(slot)`

---

## АРХИТЕКТУРА ГЕНЕРИРУЕМЫХ ПРИЛОЖЕНИЙ

Architect думает как CPO и генерирует полный план включая:
- `productStrategy` (coreAction, retentionLoop, paywall)
- `userJourney` (onboarding шаги если нужны, firstSession)
- `pages[]` со всеми экранами включая Onboarding, Settings, Paywall
- `dataModel` с реальными seed data
- `uxPatterns` и `responsiveness`

Coder реализует:
- Onboarding wizard если `plan.userJourney.onboarding.needed === true`
- Settings страницу всегда если 5+ страниц
- Paywall компонент если `plan.productStrategy.paywall.needed === true`
- Реальные seed data (не "Item 1", не "Test Entry")
- Изображения через Unsplash Source API (без ключа)
- Микроанимации через Tailwind animate классы

---

## PREVIEW АРХИТЕКТУРА

```
SandpackPreview.tsx:
  <div> (всегда в DOM)
    <iframe ref=viteIframeRef src="localhost:3100"
            display=isReact?block:none />     ← НИКОГДА не unmount
    <iframe ref=srcdocIframeRef
            display=isReact?none:block />     ← НИКОГДА не unmount
    {loading spinner}
    {error overlay}
    {autofix overlay}
  </div>
```

**Критическое правило:** iframe НИКОГДА не unmount-ится.
Любое переключение (вкладки, устройства, view) — только через `display: none/block`.
Нарушение → `removeChild` crash от Vite HMR.

**Suspense правило:** Каждый lazy компонент в своей Suspense границе.
Один общий Suspense на всё → suspend любого компонента убивает EngineWorkspace.

---

## МОБИЛЬНЫЙ ЭКСПОРТ (Cloud tab)

```
"Convert to React Native" → MobilePublishService.generateRNCode()
  → Build слот LLM → парсим FILE маркеры → rnFiles

"Download ZIP" → MobilePublishService.downloadZip()
"Preview in Expo Snack" → MobilePublishService.openInSnack() → snack.expo.dev

Credentials (в ConfigService):
  EAS Token → EASService.validateEAS()
  ASC Issuer ID + Key ID + .p8 → EASService.validateASC() (JWT через Web Crypto API)
  Google Service Account JSON → EASService.validateGooglePlay() (OAuth2 через Web Crypto API)

Build/Submit → активируется в июне 2025 (EAS API заглушки готовы)
```

---

## ЗАПРЕЩЁННЫЕ ПАТТЕРНЫ

```typescript
// ❌ Захардкоженная модель
model: 'anthropic/claude-3.5-sonnet'

// ✅ Через ConfigService
model: ConfigService.resolveModel('build')

// ❌ Условный рендер компонента с iframe
{tab === 'preview' && <SandpackView />}

// ✅ Display управление
<div style={{ display: tab === 'preview' ? 'block' : 'none' }}>
  <SandpackView />
</div>

// ❌ localStorage как источник правды для проектов
ProjectStorage.getProject(id)  // только как fallback

// ✅ Supabase как источник правды
ProjectRepository.getProject(id)  // Supabase first, localStorage fallback

// ❌ Напрямую писать в localStorage
localStorage.setItem('projects', ...)

// ✅ Только через ConfigService или ProjectRepository
ConfigService.setApiKey(key)
ProjectRepository.saveProject(project)
```

---

## НЕ ТРОГАТЬ

- `preview-app/src/components/ui/` — 19 shadcn компонентов
- `preview-app/src/lib/utils.ts` — cn() утилита
- `preview-app/src/main.tsx` — точка входа preview
- `preview-app/src/themes/` — 5 CSS тем (защищены от clearPreview)
- `frontend/src/components/ui/` — shadcn компоненты студии

---

## СРЕДА РАЗРАБОТКИ

```powershell
# Запуск (из c:\ai_studio\)
npm run dev:all

# TypeScript проверка (из c:\ai_studio\frontend\)
npx tsc --noEmit

# Студия: http://localhost:5183
# Preview: http://localhost:3100

# Среда: Windows, PowerShell
# Команды по одной (не через &&)
```

---

## ТЕКУЩИЙ СТАТУС (03.04.2026)

**Готово:**
- SimpleGeneration pipeline (Architect + Coder + AutoFix)
- Три режима: landing / app / superapp
- Темы (5 CSS пресетов)
- EDIT mode (точечные правки без clearPreview)
- WeeklyFeedPanel с банком идей (ежедневное обновление)
- Запуск из идей с пропуском Architect (prebuiltPlan)
- Cloud tab (EAS, App Store Connect, Google Play UI)
- React Native export + Expo Snack preview
- Product Architect модуль (живые данные из preview-app)
- Supabase подключён (`[StorageService] Connected ✓`)
- removeChild crash устранён (изолированные Suspense границы)

**В процессе:**
- ProjectRepository (канонизация хранилища → Supabase)
- Сессия B: Architect думает как CPO (onboarding, paywall, settings в плане)
- Сессия C: Реальный контент (Unsplash, seed data, микроанимации)

**Backlog:**
- bundle size оптимизация (сейчас 1.29MB)
- BenchmarkGate как стоп-кран для релизов
- EAS Build/Submit (июнь 2025)
- AgentLab полировка
