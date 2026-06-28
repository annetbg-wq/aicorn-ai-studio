import {
  createBrowserPreviewRuntimeAcceptanceDriver,
  runRuntimeAcceptanceGate,
  type RuntimeAcceptanceResult,
} from './PreviewRuntimeAcceptanceGate';

export interface FinalPreviewAcceptanceHarnessDependencies {
  runRuntimeGate?: (buildId: string) => Promise<RuntimeAcceptanceResult>;
}

export interface FinalPreviewAcceptanceHarnessResult {
  status: 'passed' | 'failed';
  failedGate: 'runtime' | null;
  reasonCode: string | null;
  reasonMessage: string | null;
  runtime: RuntimeAcceptanceResult;
}

export async function runFinalPreviewAcceptanceHarness(
  buildId: string,
  dependencies: FinalPreviewAcceptanceHarnessDependencies = {},
): Promise<FinalPreviewAcceptanceHarnessResult> {
  const runRuntimeGate = dependencies.runRuntimeGate ?? defaultRunRuntimeGate;
  const runtime = await runRuntimeGate(buildId);

  if (runtime.status === 'failed') {
    return {
      status: 'failed',
      failedGate: 'runtime',
      reasonCode: runtime.failure?.code ?? 'runtime_gate_failed',
      reasonMessage: runtime.failure?.message ?? 'Runtime acceptance failed.',
      runtime,
    };
  }

  return {
    status: 'passed',
    failedGate: null,
    reasonCode: null,
    reasonMessage: null,
    runtime,
  };
}

async function defaultRunRuntimeGate(buildId: string): Promise<RuntimeAcceptanceResult> {
  return runRuntimeAcceptanceGate(buildId, createBrowserPreviewRuntimeAcceptanceDriver());
}
