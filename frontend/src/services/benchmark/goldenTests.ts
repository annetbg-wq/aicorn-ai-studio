/**
 * goldenTests — structured test cases for automated generation quality checks.
 *
 * Unlike goldenIntents (soft min-file counts), each golden test defines
 * hard expectations: required files, routes, and feature markers that
 * MUST appear in the generated output for the test to pass.
 *
 * Used by BenchmarkService for deep quality regression testing.
 */

export interface GoldenTest {
  id:               string;
  prompt:           string;
  /** Files that MUST be present in generation output (path suffixes). */
  expectedFiles:    string[];
  /** Route paths the app should expose (checked in routes.json / router config). */
  expectedRoutes:   string[];
  /** Substrings or patterns that MUST appear somewhere in the generated code. */
  mustHaveFeatures: string[];
}

export const goldenTests: GoldenTest[] = [
  // ── 1. Todo App ──────────────────────────────────────────────────────────
  {
    id: 'test-todo',
    prompt:
      'Task management app with multiple pages: a main Dashboard page showing task stats and today\'s tasks, a separate TaskList page with TodoList component for browsing all tasks with filters (all/active/completed), each task rendered by a reusable TodoItem component with checkbox, text, and delete button. Include add task form, search, and category filters. Bottom tab navigation between Dashboard and Tasks pages.',
    expectedFiles: [
      'App.tsx',
      'TodoList.tsx',
      'TodoItem.tsx',
    ],
    expectedRoutes: ['/'],
    mustHaveFeatures: [
      'useState',
      'addTodo',
      'deleteTodo',
      'completed',
      'filter',
      '<input',
      '<button',
    ],
  },

  // ── 2. Expense Tracker ───────────────────────────────────────────────────
  {
    id: 'test-expense-tracker',
    prompt:
      'Personal finance app with 3 pages: Dashboard page showing total balance and recent transactions, Add Expense page with ExpenseForm component (amount, description, category select, date picker), and Analytics page with Chart component showing spending by category as a bar chart. ExpenseList component on dashboard shows last 10 transactions with category badges. Bottom tab navigation. Use seed data with 5 realistic expenses.',
    expectedFiles: [
      'App.tsx',
      'ExpenseForm.tsx',
      'ExpenseList.tsx',
      'Chart.tsx',
    ],
    expectedRoutes: ['/', '/add'],
    mustHaveFeatures: [
      'category',
      'amount',
      'useState',
      'addExpense',
      '<select',
      'chart',
      'total',
    ],
  },

  // ── 3. Recipe Book ───────────────────────────────────────────────────────
  {
    id: 'test-recipe-book',
    prompt:
      'Recipe collection app with pages: Browse page with RecipeList showing RecipeCard components (image placeholder, title, time, difficulty badge) in a grid layout, Recipe Detail page showing full ingredients and steps, and Favorites page. Search bar with real-time filtering. Heart icon to toggle favorites. Seed data with 5 real recipes including ingredients and cooking steps.',
    expectedFiles: [
      'App.tsx',
      'RecipeList.tsx',
      'RecipeCard.tsx',
    ],
    expectedRoutes: ['/', '/recipe'],
    mustHaveFeatures: [
      'search',
      'favorite',
      'ingredients',
      'useState',
      'filter',
      '<input',
    ],
  },

  // ── 4. Habit Tracker ─────────────────────────────────────────────────────
  {
    id: 'test-habit-tracker',
    prompt:
      'Daily habit tracking app with: main Habits page showing HabitList of toggleable habits with streak counters, a Calendar page with Calendar component showing a monthly grid where completed days are highlighted, and Stats page showing weekly completion rates. Each habit has name, icon emoji, current streak, and daily toggle. Seed data with 4 habits. Bottom tab navigation.',
    expectedFiles: [
      'App.tsx',
      'HabitList.tsx',
      'Calendar.tsx',
    ],
    expectedRoutes: ['/'],
    mustHaveFeatures: [
      'streak',
      'habit',
      'Date',
      'useState',
      'toggleHabit',
      'calendar',
    ],
  },

  // ── 5. Weather Dashboard ─────────────────────────────────────────────────
  {
    id: 'test-weather-dashboard',
    prompt:
      'Weather dashboard app with: main Weather page showing WeatherCard component with current temperature, conditions icon, humidity, and wind speed for selected city, a SearchBar component for city lookup with autocomplete suggestions, and a Forecast section showing 5-day forecast cards. Use mock weather data (not real API). Cities: Moscow, London, Tokyo. Sidebar or top nav.',
    expectedFiles: [
      'App.tsx',
      'SearchBar.tsx',
      'WeatherCard.tsx',
    ],
    expectedRoutes: ['/'],
    mustHaveFeatures: [
      'city',
      'temperature',
      'fetch',
      'useState',
      '<input',
      'weather',
      'search',
    ],
  },

  // ── 6. Markdown Notes ────────────────────────────────────────────────────
  {
    id: 'test-markdown-notes',
    prompt:
      'Note-taking app with 2 pages: Notes list page showing all notes with NotesList component (title, preview text, date), and Editor page with split view — left side is a textarea for markdown input, right side shows rendered preview using a MarkdownPreview component that converts **bold**, *italic*, # headings, and - lists to HTML. Add/delete notes. Seed data with 3 notes.',
    expectedFiles: [
      'App.tsx',
      'Editor.tsx',
      'Preview.tsx',
      'NoteList.tsx',
    ],
    expectedRoutes: ['/', '/edit'],
    mustHaveFeatures: [
      'markdown',
      '<textarea',
      'preview',
      'useState',
      'dangerouslySetInnerHTML',
      'note',
    ],
  },

  // ── 7. Pomodoro Timer ────────────────────────────────────────────────────
  {
    id: 'test-pomodoro',
    prompt:
      'Pomodoro productivity app with: Timer page showing a large circular TimerDisplay component with start/pause/reset buttons and work(25min)/break(5min) modes, and Tasks page with TaskList component for managing tasks with estimated pomodoro counts. Timer page also shows current task name. Sound notification placeholder when timer ends. Bottom tab navigation.',
    expectedFiles: [
      'App.tsx',
      'Timer.tsx',
      'TaskList.tsx',
    ],
    expectedRoutes: ['/'],
    mustHaveFeatures: [
      'setInterval',
      'minutes',
      'seconds',
      'start',
      'pause',
      'reset',
      'useState',
      'task',
    ],
  },

  // ── 8. Flashcard App ─────────────────────────────────────────────────────
  {
    id: 'test-flashcards',
    prompt:
      'Flashcard study app with: Study page showing a FlashCard component that flips on click to reveal the answer with \'Know it\' and \'Still learning\' buttons, Decks page with DeckList showing card decks with progress bars, and Add Cards page with form to create new cards (front/back). Track which cards are mastered vs learning. Seed data with 2 decks of 4 cards each.',
    expectedFiles: [
      'App.tsx',
      'Flashcard.tsx',
      'DeckList.tsx',
    ],
    expectedRoutes: ['/', '/study'],
    mustHaveFeatures: [
      'front',
      'back',
      'flip',
      'deck',
      'useState',
      'interval',
      'review',
    ],
  },

  // ── 9. Fitness Log ───────────────────────────────────────────────────────
  {
    id: 'test-fitness-log',
    prompt:
      'Workout tracking app with: Log page showing WorkoutLog component with today\'s exercises (name, sets, reps, weight), Add Workout page with ExerciseForm to log exercises with multiple sets, and History page showing past 7 days of workouts in a list. Each workout entry shows total volume (sets × reps × weight). Seed data with 3 days of workouts. Bottom tab navigation.',
    expectedFiles: [
      'App.tsx',
      'WorkoutForm.tsx',
      'WorkoutList.tsx',
      'ExerciseItem.tsx',
    ],
    expectedRoutes: ['/', '/add'],
    mustHaveFeatures: [
      'exercise',
      'sets',
      'reps',
      'useState',
      'addWorkout',
      '<input',
      'workout',
    ],
  },

  // ── 10. Personal Finance Dashboard ───────────────────────────────────────
  {
    id: 'test-finance-dashboard',
    prompt:
      'Budget management app with: Overview page showing BudgetDashboard with total income/expenses/remaining and a progress bar per budget category, Transactions page with TransactionList component showing filterable transaction history with amount, category, and date, and Add Transaction page with form. Budget categories: Food, Transport, Entertainment, Shopping each with monthly limit. Seed data with 8 transactions.',
    expectedFiles: [
      'App.tsx',
      'BudgetCard.tsx',
      'TransactionList.tsx',
      'Summary.tsx',
    ],
    expectedRoutes: ['/', '/transactions'],
    mustHaveFeatures: [
      'budget',
      'income',
      'expense',
      'balance',
      'useState',
      'category',
      'progress',
    ],
  },
];

// ── Validation helpers ───────────────────────────────────────────────────────

export interface GoldenTestResult {
  testId:          string;
  passed:          boolean;
  missingFiles:    string[];
  missingRoutes:   string[];
  missingFeatures: string[];
}

/**
 * Validate generated output against a golden test.
 *
 * @param test     — the golden test definition
 * @param files    — generated file map (path → content)
 * @param routes   — detected routes (from routes.json or router analysis)
 */
export function validateGoldenTest(
  test:   GoldenTest,
  files:  Record<string, string>,
  routes: string[],
): GoldenTestResult {
  const filePaths  = Object.keys(files);
  const allCode    = Object.values(files).join('\n');
  const routeSet   = new Set(routes);

  const missingFiles = test.expectedFiles.filter(
    expected => !filePaths.some(p => p.endsWith(expected)),
  );

  const missingRoutes = test.expectedRoutes.filter(
    expected => !routeSet.has(expected),
  );

  const missingFeatures = test.mustHaveFeatures.filter(
    feature => !allCode.includes(feature),
  );

  return {
    testId: test.id,
    passed: missingFiles.length === 0 && missingRoutes.length === 0 && missingFeatures.length === 0,
    missingFiles,
    missingRoutes,
    missingFeatures,
  };
}
