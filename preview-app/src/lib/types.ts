export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'ai-agent' | 'action' | 'condition';
  subType: string;
  label: string;
  description: string;
  x: number;
  y: number;
  config: Record<string, string | number | boolean>;
}

export interface NodeConnection {
  id: string;
  from: string;
  to: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'draft';
  executions: number;
  lastRun: string;
  nodes: WorkflowNode[];
  connections: NodeConnection[];
  createdAt: string;
  successRate: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  hoursSaved: number;
  streak: number;
  avatar: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string;
}

export interface UsageMetric {
  label: string;
  executions: number;
  cost: number;
}

export interface SubscriptionInfo {
  plan: 'free' | 'pro';
  workflowCount: number;
  maxWorkflows: number;
  executionsThisMonth: number;
  nextBillingDate: string;
}

export interface AppState {
  workflows: Workflow[];
  teamMembers: TeamMember[];
  apiKeys: ApiKey[];
  usageMetrics: UsageMetric[];
  subscription: SubscriptionInfo;
}

export interface NodeTypeDefinition {
  type: WorkflowNode['type'];
  subType: string;
  labelKey: string;
  icon: string;
  color: string;
}