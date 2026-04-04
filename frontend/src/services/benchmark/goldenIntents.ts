/**
 * goldenIntents — canonical benchmark dataset for studio generation quality.
 *
 * Each intent has a unique id, a category tag, and the exact prompt string
 * that will be fed to GenerationPipeline.run().
 *
 * Categories:
 *   dashboard | landing | admin | mobile | ecommerce | media | form | ai-tool
 */

export type IntentCategory =
  | 'dashboard'
  | 'landing'
  | 'admin'
  | 'mobile'
  | 'ecommerce'
  | 'media'
  | 'form'
  | 'ai-tool';

export interface GoldenIntent {
  id:       string;
  category: IntentCategory;
  prompt:   string;
  /** Minimum expected file count (soft assertion for report, not a gate). */
  minFiles: number;
}

export const goldenIntents: GoldenIntent[] = [
  // ── dashboard (2) ─────────────────────────────────────────────────────────
  {
    id: 'dash-analytics',
    category: 'dashboard',
    prompt: 'Build an analytics dashboard with KPI cards, a line chart for weekly revenue, a bar chart for user sign-ups, and a recent-activity feed. Dark theme.',
    minFiles: 3,
  },
  {
    id: 'dash-project-tracker',
    category: 'dashboard',
    prompt: 'Create a project tracker dashboard with a Kanban board, task progress bars, team member avatars, and a calendar sidebar.',
    minFiles: 4,
  },

  // ── landing page (2) ──────────────────────────────────────────────────────
  {
    id: 'land-saas',
    category: 'landing',
    prompt: 'Build a SaaS landing page with a hero section, three feature cards with icons, a pricing table (Free / Pro / Enterprise), testimonials carousel, and a footer with social links.',
    minFiles: 2,
  },
  {
    id: 'land-portfolio',
    category: 'landing',
    prompt: 'Create a personal portfolio site with a hero intro, a project gallery grid with hover effects, an about-me section, and a contact form.',
    minFiles: 2,
  },

  // ── admin panel (2) ───────────────────────────────────────────────────────
  {
    id: 'admin-users',
    category: 'admin',
    prompt: 'Build an admin panel with a sidebar navigation, a paginated users table with search and role filter, and a user detail modal with edit form.',
    minFiles: 4,
  },
  {
    id: 'admin-cms',
    category: 'admin',
    prompt: 'Create a CMS admin panel with a posts list, a rich-text editor page, categories sidebar, and a publish/draft toggle.',
    minFiles: 4,
  },

  // ── mobile-first utility (2) ──────────────────────────────────────────────
  {
    id: 'mob-weather',
    category: 'mobile',
    prompt: 'Build a mobile-first weather app with current conditions card, 5-day forecast row, and a city search bar. Use soft gradients.',
    minFiles: 2,
  },
  {
    id: 'mob-todo',
    category: 'mobile',
    prompt: 'Create a mobile-first to-do list with swipe-to-complete gesture hint, category pills, and a floating add button.',
    minFiles: 2,
  },

  // ── ecommerce (2) ─────────────────────────────────────────────────────────
  {
    id: 'ecom-store',
    category: 'ecommerce',
    prompt: 'Build a product catalog page with a grid of product cards (image, title, price, rating), a category filter sidebar, and an add-to-cart button with a cart badge in the header.',
    minFiles: 4,
  },
  {
    id: 'ecom-checkout',
    category: 'ecommerce',
    prompt: 'Create a multi-step checkout flow: cart summary → shipping form → payment form → order confirmation. Include a progress stepper.',
    minFiles: 4,
  },

  // ── media app (2) ─────────────────────────────────────────────────────────
  {
    id: 'media-podcast',
    category: 'media',
    prompt: 'Build a podcast player app with an episode list, a sticky bottom player bar with play/pause/seek, and episode detail page with show notes.',
    minFiles: 3,
  },
  {
    id: 'media-gallery',
    category: 'media',
    prompt: 'Create a photo gallery with masonry layout, lightbox overlay on click, album tabs, and an upload dropzone.',
    minFiles: 3,
  },

  // ── form / workflow app (2) ───────────────────────────────────────────────
  {
    id: 'form-survey',
    category: 'form',
    prompt: 'Build a multi-step survey builder: step 1 pick question types (text, radio, checkbox), step 2 preview the survey, step 3 show a thank-you screen with results summary.',
    minFiles: 3,
  },
  {
    id: 'form-booking',
    category: 'form',
    prompt: 'Create an appointment booking form with a date picker calendar, time-slot selector, service dropdown, and confirmation card.',
    minFiles: 3,
  },

  // ── AI tool (1) ───────────────────────────────────────────────────────────
  {
    id: 'ai-chat',
    category: 'ai-tool',
    prompt: 'Build a ChatGPT-style chat interface with a message list (user/assistant bubbles), a prompt input with send button, a model selector dropdown, and a conversation history sidebar.',
    minFiles: 3,
  },
];
