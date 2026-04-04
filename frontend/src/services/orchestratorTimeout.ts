export const ORCHESTRATOR_TIMEOUT_MS = 60_000;

export type OrchestratorTimeoutResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export function withOrchestratorTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number = ORCHESTRATOR_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[Orchestrator] timeout after ${timeoutMs}ms - ${label}`)),
      timeoutMs,
    );
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export function withOrchestratorTimeoutResult<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number = ORCHESTRATOR_TIMEOUT_MS,
): Promise<OrchestratorTimeoutResult<T>> {
  return new Promise<OrchestratorTimeoutResult<T>>((resolve) => {
    let settled = false;
    const finish = (result: OrchestratorTimeoutResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: new Error(`[Orchestrator] timeout after ${timeoutMs}ms - ${label}`) }),
      timeoutMs,
    );
    promise.then(
      value => finish({ ok: true, value }),
      error => finish({ ok: false, error: error instanceof Error ? error : new Error(String(error)) }),
    );
  });
}