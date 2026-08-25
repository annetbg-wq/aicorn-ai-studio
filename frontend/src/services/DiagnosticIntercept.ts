/**
 * DiagnosticIntercept — the interactive-execution primitive for the Superadmin
 * MCP's generation-pipeline tools.
 *
 * When a diagnostic run is active for this browser session (sessionStorage),
 * every LLM call normally made by LLMProxy.llmFetch/llmFetchStream is paused
 * instead of sent: the exact request (endpoint/headers/body — i.e. the same
 * input the real LLM would have received) is recorded as a pending step in
 * Supabase, and the call waits for an external result. The MCP server reads
 * the pending step, lets an external executor produce a result, and writes it
 * back; this module picks that up and returns it as a normal Response, so
 * every existing downstream code path (parsing, validators, file writes,
 * compile) runs exactly as it would with a real LLM response.
 *
 * This file is the entire footprint on the generation pipeline. Nothing in
 * ProtoPipeline, Orchestrator, or any agent service changes.
 */
import { supabase } from '../lib/supabase';

const RUN_ID_KEY = 'AIC_DIAGNOSTIC_RUN_ID';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1_000; // an external reviewer needs real time to respond

export function activeDiagnosticRunId(): string | null {
  try {
    return sessionStorage.getItem(RUN_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveDiagnosticRun(runId: string | null): void {
  try {
    if (runId) sessionStorage.setItem(RUN_ID_KEY, runId);
    else sessionStorage.removeItem(RUN_ID_KEY);
  } catch {
    // sessionStorage unavailable (SSR / locked-down context) — diagnostic mode simply can't activate.
  }
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const clone: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    clone[key] = /^(authorization|x-api-key|api-key)$/i.test(key) ? '[redacted]' : value;
  }
  return clone;
}

async function registerPendingStep(
  runId: string,
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  stepName: string,
): Promise<string> {
  let parsedBody: unknown = body;
  try { parsedBody = JSON.parse(body); } catch { /* keep raw string */ }

  const { count } = await supabase
    .from('diagnostic_run_steps')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId);

  const { data: inserted, error } = await supabase
    .from('diagnostic_run_steps')
    .insert({
      run_id:            runId,
      step_index:        count ?? 0,
      step_name:         stepName,
      status:            'pending',
      request_endpoint:  endpoint,
      request_headers:   redactHeaders(headers),
      request_body:      parsedBody,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    throw new Error(`[DiagnosticIntercept] Failed to register step: ${error?.message ?? 'unknown error'}`);
  }
  return inserted.id as string;
}

async function waitForResolution(runId: string, stepId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

    const { data: run } = await supabase
      .from('diagnostic_runs')
      .select('status')
      .eq('id', runId)
      .maybeSingle();
    if (run?.status === 'stopped') {
      throw new Error('[DiagnosticIntercept] Run was stopped externally.');
    }

    const { data: step, error } = await supabase
      .from('diagnostic_run_steps')
      .select('status, resolved_result')
      .eq('id', stepId)
      .maybeSingle();
    if (error) throw new Error(`[DiagnosticIntercept] Failed to poll step: ${error.message}`);

    if (step?.status === 'resolved' && step.resolved_result != null) {
      return typeof step.resolved_result === 'string'
        ? step.resolved_result
        : JSON.stringify(step.resolved_result);
    }
    if (step?.status === 'rejected') {
      throw new Error('[DiagnosticIntercept] Step result was rejected during validation.');
    }
  }

  throw new Error(`[DiagnosticIntercept] Timed out after ${POLL_TIMEOUT_MS / 1000}s waiting for step ${stepId} (run ${runId}).`);
}

/** Returns null (proceed with the real call) when no diagnostic run is active for this session. */
export async function interceptForDiagnosticRun(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  stepName = 'unknown',
): Promise<Response | null> {
  const runId = activeDiagnosticRunId();
  if (!runId) return null;

  const stepId = await registerPendingStep(runId, endpoint, headers, body, stepName);
  const text = await waitForResolution(runId, stepId);
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Streaming variant. Diagnostic mode does not emulate real token-by-token
 * streaming — the full resolved result arrives as one SSE chunk. Downstream
 * consumers accumulate SSE deltas into a final text either way, so this is
 * behaviorally equivalent for parsing/validation, just not incremental.
 */
export async function interceptForDiagnosticRunStream(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  stepName = 'unknown',
): Promise<Response | null> {
  const runId = activeDiagnosticRunId();
  if (!runId) return null;

  const stepId = await registerPendingStep(runId, endpoint, headers, body, stepName);
  const text = await waitForResolution(runId, stepId);

  const sse = `data: ${text}\n\ndata: [DONE]\n\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sse));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
