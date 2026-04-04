export interface StudioBlock {
  id: string;
  name: string;
  status: 'active' | 'soon' | 'stub';
  description?: string;
}

export interface StudioModule {
  id: string;
  name: string;
  status: 'active' | 'soon';
  blocks: StudioBlock[];
}

export const STUDIO_MODULES: StudioModule[] = [
  {
    id: 'engine',
    name: 'System Engine',
    status: 'active',
    blocks: [
      { id: 'code-gen', name: 'Code Generation', status: 'active' },
      { id: 'orchestrator', name: 'Orchestrator', status: 'active' },
      { id: 'preview', name: 'Preview & iframe', status: 'active' },
      { id: 'scanner', name: 'Scanner Service', status: 'active' },
      { id: 'dispatcher', name: 'Dispatcher', status: 'active' },
      { id: 'agent-loop', name: 'Agent Loop', status: 'active' },
    ]
  },
  {
    id: 'architect',
    name: 'Product Architect',
    status: 'soon',
    blocks: [
      { id: 'requirements', name: 'Requirements', status: 'stub' },
      { id: 'user-journeys', name: 'User Journeys', status: 'stub' },
      { id: 'system-arch', name: 'System Architecture', status: 'stub' },
    ]
  },
  {
    id: 'figma',
    name: 'Figma Platinum',
    status: 'active',
    blocks: [
      { id: 'digital-twin', name: 'Digital Twin', status: 'active' },
      { id: 'design-dna', name: 'Design DNA', status: 'active' },
      { id: 'deep-scan', name: 'Deep Scan', status: 'active' },
    ]
  },
  {
    id: 'cloud',
    name: 'Cloud & Backend',
    status: 'soon',
    blocks: [
      { id: 'database', name: 'Database', status: 'stub' },
      { id: 'functions', name: 'Serverless Functions', status: 'stub' },
      { id: 'deploy', name: 'Deploy', status: 'stub' },
    ]
  },
  {
    id: 'ship',
    name: 'Packaging & Ship',
    status: 'soon',
    blocks: [
      { id: 'bundler', name: 'Bundler', status: 'stub' },
      { id: 'cicd', name: 'CI/CD', status: 'stub' },
    ]
  },
  {
    id: 'growth',
    name: 'Growth & Marketing',
    status: 'soon',
    blocks: [
      { id: 'analytics', name: 'Analytics', status: 'stub' },
      { id: 'ab-testing', name: 'A/B Testing', status: 'stub' },
      { id: 'seo', name: 'SEO', status: 'stub' },
    ]
  },
];
