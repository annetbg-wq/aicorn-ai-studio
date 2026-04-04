import React, { useState } from 'react';

const PROMPTS = [
  {
    icon: '📊',
    label: 'SaaS Dashboard',
    prompt: `Create a stunning SaaS analytics dashboard. Dark glassmorphism UI (#050508 base). Include:
- Sidebar with logo, nav items (Dashboard, Analytics, Users, Revenue, Settings) with icons, active state highlight
- Header with search bar and notification bell and user avatar
- 4 KPI cards: Revenue $124K (+18%), Active Users 8,431 (+12%), Conversion 3.24% (+0.8%), Churn 1.2% (-0.3%) — with animated counters on load using requestAnimationFrame
- Area chart for revenue (last 6 months) using Chart.js with gradient fill
- Donut chart for traffic sources using Chart.js
- Recent transactions table with avatar, name, amount, status badge (green/yellow/red), sortable columns
- Clicking sidebar nav items shows different content panels (use Alpine.js)
Use indigo/violet accent (#6366f1 → #8b5cf6). Smooth entrance animations. Realistic mock data.`,
  },
  {
    icon: '🎵',
    label: 'Music Player',
    prompt: `Build a beautiful music player app. Dark glassmorphism with purple/pink gradient accents.
- Full-screen blurred album art background that changes per track
- Center: album art (rounded square, slight 3D tilt on hover), track title, artist, album
- CSS audio waveform visualizer: 40 bars animated with varying heights using CSS keyframes
- Controls: shuffle, prev, play/pause (large glow button), next, repeat — all functional via Alpine.js
- Progress bar that updates, click to seek visual feedback
- Volume slider
- Playlist panel (slide in from right): 5-6 tracks, highlight playing, click to switch
- Track switching updates everything: title, artist, album art gradient, waveform color
- Like button with heart animation
Silky smooth transitions. Feels like Spotify × Apple Music.`,
  },
  {
    icon: '✅',
    label: 'Project Manager',
    prompt: `Create a premium project management app like Linear. Ultra-dark theme.
- Left sidebar: workspace logo, nav (Inbox with badge 3, Projects, Views, Teams, Settings)
- Projects list: 5 projects with colored dot indicators, expand to show issues count
- Main area: Kanban board with 4 columns (Backlog, In Progress, In Review, Done)
- Cards with: title, priority icon (🔴🟡🟢), assignee initials avatar, label pill, subtle shadow
- Clicking a card opens right-side detail panel (smooth slide animation): title editable, description, status dropdown, priority select, assignee, due date, activity log with timestamps
- Press C to create new card (modal appears), Escape to close
- Drag feel: cards lift slightly on hover (transform + shadow)
- Column counts update dynamically
- Keyboard shortcut hints in tooltips
Monochrome with electric blue accents. Feels like a real shipped product.`,
  },
  {
    icon: '💰',
    label: 'Finance Tracker',
    prompt: `Build a personal finance tracker app. Dark theme with emerald/teal accents.
- Net worth counter at top: $84,320 animates up on load
- Summary cards: Income $6,200, Expenses $3,847, Savings $2,353 this month
- Donut chart: spending by category (Housing 35%, Food 18%, Transport 12%, Entertainment 8%, Other 27%) using Chart.js
- Monthly budget bars: each category shows spent vs budget with animated fill
- Transaction list: icon + category, description, date, amount (red/green), running balance
- Filter pills: All, Income, Expenses, by category — clicking filters list
- + Add Transaction button opens modal form: amount, category dropdown, description, date
- Saving shows toast notification and adds to list
- Month navigator: prev/next arrows change displayed data
Realistic financial data. Premium feel.`,
  },
  {
    icon: '🤖',
    label: 'AI Chat',
    prompt: `Create a premium AI chat interface. Dark glassmorphism, cleaner than ChatGPT.
- Left sidebar: chat history list (5-6 previous chats with titles), New Chat button, model selector (GPT-4o, Claude 3.5, Gemini Pro) with dropdown
- Main chat area: welcome screen when empty with suggested prompts grid
- User messages: right-aligned, indigo gradient bubble
- AI messages: left-aligned, glass card with subtle border, avatar icon
- Typing indicator: three bouncing dots with stagger animation
- Code blocks: dark background, language label, copy button that shows checkmark
- Message hover actions: copy, regenerate, thumbs up/down
- Bottom input: auto-growing textarea, send button with glow, attach icon, voice icon
- Simulated conversation: typing a message and pressing Enter adds user message, then after 1.5s shows typing indicator, then AI response (pre-written mock responses)
- Smooth scroll to bottom on new message
Feels alive and responsive.`,
  },
  {
    icon: '🛒',
    label: 'E-commerce',
    prompt: `Build a luxury e-commerce product page. Dark theme with gold accents.
- Product: "Apex Pro Headphones" — premium wireless headphones
- Image gallery: main large image + 4 thumbnails, clicking thumbnail swaps main image with smooth fade
- Right panel: product name, rating (4.8★ with 2,841 reviews), price $349 with $449 crossed out
- Color variants: 4 colored circles (Midnight Black, Arctic White, Deep Navy, Rose Gold), click to select
- Size/variant: "Connectivity" pills: Bluetooth 5.3 / Wired / True Wireless
- Quantity stepper: − / 3 / +
- Add to Cart button: gradient, click adds item with satisfying scale animation, cart counter in header updates
- Tabs: Description / Specs / Reviews — clicking shows different content
- Review section: 3 user reviews with avatar, rating stars, text
- Related products: horizontal scroll with 4 cards
- Toast on add to cart
Premium, luxury feel.`,
  },
  {
    icon: '📅',
    label: 'Calendar App',
    prompt: `Create a beautiful calendar app. Clean dark theme with blue accents.
- Month view: full calendar grid, today highlighted with blue circle
- Pre-populate with 8-10 realistic events across different dates: colored pills on date cells (Work=blue, Personal=emerald, Health=rose, Social=violet)
- Clicking a date: right panel slides in showing that day's events list
- Clicking an event: modal opens with event details (title, time, location, description, color category)
- Top bar: "< February 2025 >" navigation (arrow clicks animate month change), Month/Week/Day toggle buttons, + New Event button
- New Event button: opens modal form with fields (title, date, start/end time, category color picker, description)
- Mini month picker in left sidebar
- Week numbers in sidebar
- Recurring event badge (small loop icon)
- Today button to jump back
Smooth animations on month transitions (slide left/right).`,
  },
  {
    icon: '🎮',
    label: 'Game Dashboard',
    prompt: `Create an epic RPG game character dashboard. Dark fantasy theme, gold/purple accents.
- Character card: gradient avatar silhouette, Name "Kaelthas", Class "Shadow Mage", Level 42
- XP bar: animated fill to 73% with shimmer effect, "14,230 / 20,000 XP"
- Stat bars: Health 890/1000 (red), Mana 450/600 (blue), Stamina 280/300 (green) — all animated
- 9 skills grid: ability icons (use emoji or SVG circles), name, level, tooltip on hover showing description
- Inventory grid 5x4: items with rarity borders (grey=common, green=uncommon, blue=rare, purple=epic, gold=legendary), item name on hover tooltip
- Quest log sidebar: 3 active quests with progress bars, click to expand details
- Achievement badges: 6 earned achievements with glow effect
- Leaderboard panel: top 5 players with rank crown/medal icons, your rank highlighted
- Background: subtle particle/star CSS animation
- Click inventory items: detail panel slides in
Feels like a real game UI.`,
  },
];

export const WelcomeScreen = ({
  onPrompt,
  theme,
}: {
  onPrompt: (p: string) => void;
  theme: string;
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const isDark = theme !== 'light';

  return (
    <div
      className="flex flex-col items-center justify-start h-full overflow-y-auto custom-scrollbar"
      style={{ padding: '28px 16px 20px' }}
    >
      {/* Header */}
      <div className="mb-6 text-center w-full">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold mb-3"
          style={{
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.25)',
            color: '#818cf8',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#818cf8',
              display: 'inline-block',
              animation: 'pulseGlow 2s infinite',
            }}
          />
          AI Studio — Elite
        </div>
        <h1
          className="text-[18px] font-bold mb-1"
          style={{
            color: isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.85)',
            letterSpacing: '-0.03em',
          }}
        >
          What will you build?
        </h1>
        <p
          className="text-[12px]"
          style={{ color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)' }}
        >
          Pick a template or describe your idea below
        </p>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-2 gap-2 w-full">
        {PROMPTS.map((p, i) => (
          <button
            key={i}
            onClick={() => onPrompt(p.prompt)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="flex flex-col items-start gap-2 p-3 rounded-xl text-left transition-all duration-200"
            style={{
              background:
                hovered === i
                  ? isDark
                    ? 'rgba(99,102,241,0.12)'
                    : 'rgba(99,102,241,0.07)'
                  : isDark
                  ? 'rgba(255,255,255,0.03)'
                  : 'rgba(0,0,0,0.03)',
              border: `1px solid ${
                hovered === i
                  ? 'rgba(99,102,241,0.35)'
                  : isDark
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(0,0,0,0.07)'
              }`,
              transform: hovered === i ? 'translateY(-1px)' : 'translateY(0)',
              boxShadow:
                hovered === i ? '0 8px 24px rgba(99,102,241,0.15)' : 'none',
            }}
          >
            <span style={{ fontSize: 22 }}>{p.icon}</span>
            <span
              className="text-[11px] font-semibold leading-tight"
              style={{
                color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.7)',
              }}
            >
              {p.label}
            </span>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes pulseGlow {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(129,140,248,0.4); }
          50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(129,140,248,0); }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  );
};
