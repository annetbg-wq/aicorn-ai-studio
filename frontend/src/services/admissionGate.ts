import type { AdmissionDecision } from './EditAdmissionService';

export async function resolveAdmissionDecision(
  decision: AdmissionDecision,
  waitForAdmission: ((decision: AdmissionDecision) => Promise<boolean>) | undefined,
  onLog: (msg: string) => void,
): Promise<boolean> {
  if (!decision.requiresConfirmation) return true;

  if (!waitForAdmission) {
    onLog(
      `[AdmissionControl] risk=${decision.risk} blocked because no admission handler is registered`,
    );
    return false;
  }

  onLog(
    `[AdmissionControl] risk=${decision.risk} reasons=[${decision.reasons.join('; ')}]`,
  );
  return waitForAdmission(decision);
}
