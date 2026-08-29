import { env } from '../env.js';

const GRAPHQL_URL = 'https://backboard.railway.com/graphql/v2';

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string; extensions?: { code?: string; traceId?: string } }>;
}

async function railwayGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Project-Access-Token': env.RAILWAY_PROJECT_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const raw = await response.text();
  let envelope: GraphqlEnvelope<T>;
  try {
    envelope = JSON.parse(raw) as GraphqlEnvelope<T>;
  } catch {
    throw new Error(`Railway API ${response.status}: ${raw.slice(0, 300)}`);
  }

  if (!response.ok || envelope.errors?.length) {
    const details = envelope.errors?.map(error => {
      const code = error.extensions?.code ? ` (${error.extensions.code})` : '';
      const trace = error.extensions?.traceId ? ` trace=${error.extensions.traceId}` : '';
      return `${error.message ?? 'Unknown Railway API error'}${code}${trace}`;
    }).join('; ') ?? raw.slice(0, 300);
    throw new Error(`Railway API ${response.status}: ${details}`);
  }
  if (!envelope.data) throw new Error('Railway API returned no data.');
  return envelope.data;
}

const deploymentInput = () => ({
  projectId: env.RAILWAY_PROJECT_ID,
  environmentId: env.RAILWAY_ENVIRONMENT_ID,
  serviceId: env.RAILWAY_BACKEND_SERVICE_ID,
});

export interface RailwayDeployment {
  id: string;
  status: string;
  createdAt: string;
  url?: string | null;
  staticUrl?: string | null;
}

export async function listDeployments(limit = 10): Promise<RailwayDeployment[]> {
  const data = await railwayGraphql<{
    deployments: { edges: Array<{ node: RailwayDeployment }> };
  }>(
    `query deployments($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges { node { id status createdAt url staticUrl } }
      }
    }`,
    { input: deploymentInput(), first: limit },
  );
  return data.deployments.edges.map(edge => edge.node);
}

export async function getBackendServiceInstance() {
  const data = await railwayGraphql<{
    serviceInstance: {
      id: string;
      serviceName: string;
      startCommand?: string | null;
      buildCommand?: string | null;
      rootDirectory?: string | null;
      healthcheckPath?: string | null;
      region?: string | null;
      numReplicas?: number | null;
      latestDeployment?: RailwayDeployment | null;
    };
  }>(
    `query serviceInstance($serviceId: String!, $environmentId: String!) {
      serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
        id serviceName startCommand buildCommand rootDirectory healthcheckPath region numReplicas
        latestDeployment { id status createdAt }
      }
    }`,
    { serviceId: env.RAILWAY_BACKEND_SERVICE_ID, environmentId: env.RAILWAY_ENVIRONMENT_ID },
  );
  return data.serviceInstance;
}

export async function triggerBackendDeploy() {
  const data = await railwayGraphql<{ serviceInstanceDeployV2: string }>(
    `mutation serviceInstanceDeployV2($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId: env.RAILWAY_BACKEND_SERVICE_ID, environmentId: env.RAILWAY_ENVIRONMENT_ID },
  );
  return { deploymentId: data.serviceInstanceDeployV2 };
}

export async function getBackendLogs(limit = 100) {
  const deployments = await listDeployments(1);
  const deployment = deployments[0];
  if (!deployment) return { deployment: null, logs: [] };
  const data = await railwayGraphql<{
    deploymentLogs: Array<{ timestamp: string; message: string; severity?: string | null }>;
  }>(
    `query deploymentLogs($deploymentId: String!, $limit: Int) {
      deploymentLogs(deploymentId: $deploymentId, limit: $limit) { timestamp message severity }
    }`,
    { deploymentId: deployment.id, limit },
  );
  return { deployment, logs: data.deploymentLogs };
}

/** Variable names only. Values are intentionally discarded before returning to an MCP caller. */
export async function listBackendEnvVarKeys(): Promise<string[]> {
  const data = await railwayGraphql<{ variables: Record<string, string> }>(
    `query variables($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    deploymentInput(),
  );
  return Object.keys(data.variables ?? {}).sort();
}
