import { Sparkles, Zap, Shield, Users, Workflow, Layers, type LucideIcon } from 'lucide-react';

/**
 * Every line of marketing copy lives here so the agent can rewrite the
 * landing page in one place without touching components.
 */

export const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

/** PRODUCT: replace logo names with real customers/partners. */
export const SOCIAL_PROOF_LOGOS: readonly string[] = [
  'NorthBeam',
  'Ridgeline',
  'Lumen Labs',
  'Pebble',
  'Tide',
  'Foundry',
  'Cordial',
  'Vector',
] as const;

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const FEATURES: readonly Feature[] = [
  {
    icon: Zap,
    title: 'Move quickly',
    body: 'Skip setup ceremony. Get from idea to a working surface in a single afternoon.',
  },
  {
    icon: Workflow,
    title: 'Stay organized',
    body: 'Everything from your team lives in one place — searchable, linked, no lost threads.',
  },
  {
    icon: Layers,
    title: 'Build in the open',
    body: 'Share progress with stakeholders without exporting to slides or copy-pasting screenshots.',
  },
  {
    icon: Users,
    title: 'Bring your team',
    body: 'Roles, permissions, and an inbox that actually filters out the noise.',
  },
  {
    icon: Shield,
    title: 'Trust by default',
    body: 'SSO, audit trails, and data ownership your security team will sign off on.',
  },
  {
    icon: Sparkles,
    title: 'Smart, not magic',
    body: 'AI assists where it helps and gets out of the way where it does not.',
  },
] as const;

interface Step {
  number: string;
  title: string;
  body: string;
}

export const STEPS: readonly Step[] = [
  {
    number: '01',
    title: 'Connect what you have',
    body: 'Bring in existing data sources, docs, and team — no migration project required.',
  },
  {
    number: '02',
    title: 'Pick a starting point',
    body: 'Choose a template, or describe the outcome and let AppName lay down a structure.',
  },
  {
    number: '03',
    title: 'Ship and iterate',
    body: 'Hand off to your team and refine in days, not quarters.',
  },
] as const;

export interface PricingTier {
  name: string;
  monthly: number;
  annual: number;
  highlight?: boolean;
  description: string;
  features: readonly string[];
  cta: string;
}

export const PRICING: readonly PricingTier[] = [
  {
    name: 'Starter',
    monthly: 0,
    annual: 0,
    description: 'For solo founders and prototypes.',
    features: ['Up to 3 projects', 'Basic templates', 'Community support'],
    cta: 'Start free',
  },
  {
    name: 'Team',
    monthly: 29,
    annual: 24,
    highlight: true,
    description: 'For small teams shipping together.',
    features: [
      'Unlimited projects',
      'All templates and integrations',
      'Roles and permissions',
      'Priority email support',
    ],
    cta: 'Start trial',
  },
  {
    name: 'Business',
    monthly: 79,
    annual: 65,
    description: 'For organizations with security needs.',
    features: [
      'Everything in Team',
      'SSO and SCIM',
      'Audit logs and SLAs',
      'Dedicated account manager',
    ],
    cta: 'Contact sales',
  },
] as const;

interface FAQItem {
  q: string;
  a: string;
}

export const FAQ: readonly FAQItem[] = [
  {
    q: 'How is this different from what we already use?',
    a: 'Most tools force you to pick: simple but limited, or powerful but heavy. AppName starts simple and grows with your workflow — no migrations, no plugin sprawl.',
  },
  {
    q: 'Do I need to bring my whole team to try it?',
    a: 'No. Start solo, invite teammates only when the workflow clicks. Per-seat pricing kicks in only above the free tier.',
  },
  {
    q: 'How do you handle our data?',
    a: 'Your data stays yours. Encrypted at rest and in transit, exportable at any time, and never used to train models without your consent.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes. Starter is free forever — no time limit, no credit card required.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Paid plans are month-to-month, no contracts. Annual billing gets a discount but is not required.',
  },
] as const;

/** PRODUCT: replace footer columns with real link sets. */
export const FOOTER_COLUMNS: ReadonlyArray<{
  heading: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}> = [
  {
    heading: 'Product',
    links: [
      { href: '#features', label: 'Features' },
      { href: '#pricing', label: 'Pricing' },
      { href: '#faq', label: 'FAQ' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '#', label: 'About' },
      { href: '#', label: 'Blog' },
      { href: '#', label: 'Careers' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { href: '#', label: 'Docs' },
      { href: '#', label: 'Changelog' },
      { href: '#', label: 'Status' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '#', label: 'Privacy' },
      { href: '#', label: 'Terms' },
      { href: '#', label: 'Security' },
    ],
  },
] as const;
