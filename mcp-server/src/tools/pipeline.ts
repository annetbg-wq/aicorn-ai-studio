import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { readFileAtRef } from '../lib/gitRepo.js';

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

async function loadRun(runId: string) {
  const { data, error } = await supabaseAdmin().from('diagnostic_runs').select('*').eq('id', runId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function loadSteps(runId: string) {
  const { data, error } = await supabaseAdmin()
    .from('diagnostic_run_steps')
    .select('*')
    .eq('run_id', runId)
    .order('step_index', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function registerPipelineTools(server: McpServer): void {
  // ── Static introspection (read-only, no diagnostic run needed) ───────────

  server.registerTool(
    'pipeline_list_generation_paths',
    {
      title: 'List known generation pipeline stages/paths',
      description:
        'Reads the actual identifiers the pipeline uses today, straight from source (frontend/src/shared/projectModel.ts\'s ' +
        'GenerationRunStepId union, and the buildStage values ProtoPipeline.ts actually emits). Note: the informal names ' +
        '"skeleton_assembly" / "blank_canvas" / "LVPipeline" do not currently exist as literal identifiers anywhere in the ' +
        'repo — this tool reports what is actually there instead of guessing a taxonomy that isn\'t implemented.',
      inputSchema: { ref: z.string().default('main') },
    },
    async ({ ref }) => {
      const [projectModel, protoPipeline] = await Promise.all([
        readFileAtRef('frontend/src/shared/projectModel.ts', ref),
        readFileAtRef('frontend/src/services/ProtoPipeline.ts', ref),
      ]);
      const stepIdBlock = projectModel.match(/export type GenerationRunStepId =([\s\S]*?);/)?.[1] ?? '';
      const stepIds = Array.from(stepIdBlock.matchAll(/'([a-zA-Z0-9_]+)'/g)).map(m => m[1]);
      const buildStages = Array.from(new Set(
        Array.from(protoPipeline.matchAll(/buildStage\s*[:=]\s*'([a-zA-Z0-9_]+)'/g)).map(m => m[1]),
      ));
      return text({
        source: { projectModel: 'frontend/src/shared/projectModel.ts', protoPipeline: 'frontend/src/services/ProtoPipeline.ts' },
        generationRunStepIds: stepIds,
        buildStages,
      });
    },
  );

  server.registerTool(
    'pipeline_list_fixtures',
    {
      title: 'List trend niches / eval test fixtures',
      description: 'Golden-intent eval fixtures (id + category) from frontend/src/services/benchmark/goldenIntents.ts, and recent trend-niche archive entries from backend/trend-archive.json.',
      inputSchema: { ref: z.string().default('main'), trendLimit: z.number().int().min(1).max(50).default(10) },
    },
    async ({ ref, trendLimit }) => {
      const [goldenIntentsSrc, trendArchiveSrc] = await Promise.all([
        readFileAtRef('frontend/src/services/benchmark/goldenIntents.ts', ref),
        readFileAtRef('backend/trend-archive.json', ref).catch(() => '[]'),
      ]);
      const intents = Array.from(goldenIntentsSrc.matchAll(/id:\s*'([^']+)'/g)).map(m => m[1]);
      let trendEntries: unknown[] = [];
      try { trendEntries = JSON.parse(trendArchiveSrc); } catch { /* leave empty */ }
      return text({
        goldenIntentIds: intents,
        trendArchive: trendEntries.slice(0, trendLimit),
      });
    },
  );

  // ── Diagnostic run lifecycle ──────────────────────────────────────────────

  server.registerTool(
    'pipeline_create_diagnostic_run',
    {
      title: 'Create an empty diagnostic run',
      description:
        'Creates a new diagnostic run record. This alone does not start any generation — a browser session pointed at ' +
        'this run (sessionStorage AIC_DIAGNOSTIC_RUN_ID = this id) and driven through the Studio UI is what actually ' +
        'produces steps, pausing before each LLM call for this MCP to drive interactively.',
      inputSchema: { label: z.string().optional() },
    },
    async ({ label }) => {
      const { data, error } = await supabaseAdmin()
        .from('diagnostic_runs')
        .insert({ label: label ?? null, status: 'created', created_by: 'mcp' })
        .select('*')
        .single();
      if (error) return fail(error.message);
      return text(data);
    },
  );

  server.registerTool(
    'pipeline_get_run_state',
    {
      title: 'Get a diagnostic run\'s full state',
      description: 'The run record plus every step captured so far, in order.',
      inputSchema: { runId: z.string() },
    },
    async ({ runId }) => {
      const [run, steps] = await Promise.all([loadRun(runId), loadSteps(runId)]);
      if (!run) return fail(`No diagnostic run with id ${runId}`);
      return text({ run, steps });
    },
  );

  server.registerTool(
    'pipeline_get_next_step',
    {
      title: 'Get the next paused step',
      description:
        'The earliest step still in "pending" status for this run — i.e. the exact input a real LLM call would have ' +
        'received (endpoint, headers with the provider API key redacted, and the full request body: model/messages/' +
        'system prompt/context, which is where any manifests/contracts the pipeline built for this step already live). ' +
        'Returns null if there is no step currently awaiting a result.',
      inputSchema: { runId: z.string() },
    },
    async ({ runId }) => {
      const { data, error } = await supabaseAdmin()
        .from('diagnostic_run_steps')
        .select('*')
        .eq('run_id', runId)
        .eq('status', 'pending')
        .order('step_index', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) return fail(error.message);
      return text(data ?? { note: 'No pending step right now.' });
    },
  );

  server.registerTool(
    'pipeline_submit_step_result',
    {
      title: 'Submit a proposed result for a step',
      description:
        'Records a proposed result for a pending step (status -> "proposed"). Does NOT yet unblock the paused browser ' +
        'call — run pipeline_validate_step_result, then pipeline_continue_run, to actually let it through.',
      inputSchema: {
        runId: z.string(),
        stepId: z.string(),
        result: z.string().describe('The exact text/JSON the real LLM response body would have contained'),
      },
    },
    async ({ runId, stepId, result }) => {
      const { data, error } = await supabaseAdmin()
        .from('diagnostic_run_steps')
        .update({ proposed_result: result, status: 'proposed', updated_at: new Date().toISOString() })
        .eq('id', stepId)
        .eq('run_id', runId)
        .select('*')
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail('No such step on this run.');
      return text(data);
    },
  );

  server.registerTool(
    'pipeline_validate_step_result',
    {
      title: 'Validate a proposed step result',
      description:
        'Structural validation of a proposed result (well-formed JSON where the request expected JSON, non-empty, ' +
        'matches the shape the OpenAI-compatible chat/completions response format needs). This is a primitive-level ' +
        'gate, not yet the exact in-browser Studio validators (PrototypeQualityGate / LiveGenerationContractValidator) — ' +
        'those depend on browser-only context and are the natural next-phase extension once this primitive is proven.',
      inputSchema: { runId: z.string(), stepId: z.string() },
    },
    async ({ runId, stepId }) => {
      const { data: step, error } = await supabaseAdmin()
        .from('diagnostic_run_steps')
        .select('*')
        .eq('id', stepId)
        .eq('run_id', runId)
        .maybeSingle();
      if (error) return fail(error.message);
      if (!step) return fail('No such step on this run.');
      if (step.status !== 'proposed') return fail(`Step is "${step.status}", expected "proposed". Submit a result first.`);

      const issues: string[] = [];
      const raw = step.proposed_result as string;
      if (!raw || !raw.trim()) issues.push('Result is empty.');
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        issues.push('Result is not valid JSON — the LLM proxy response body must parse as JSON.');
      }

      const validation = { ok: issues.length === 0, issues, checkedAt: new Date().toISOString() };
      const nextStatus = issues.length === 0 ? 'validated' : 'rejected';
      const { data: updated, error: updateError } = await supabaseAdmin()
        .from('diagnostic_run_steps')
        .update({ validation, status: nextStatus, error: issues.length ? issues.join('; ') : null, updated_at: new Date().toISOString() })
        .eq('id', stepId)
        .select('*')
        .single();
      if (updateError) return fail(updateError.message);
      void parsed;
      return text(updated);
    },
  );

  server.registerTool(
    'pipeline_continue_run',
    {
      title: 'Continue a run past a validated step',
      description:
        'Commits a validated step\'s proposed result as resolved_result and flips it to "resolved" — this is what the ' +
        'paused browser call is polling for, so it unblocks and the real downstream Studio code (parsing, compile, ' +
        'file writes) picks up right where a real LLM response would have landed. Also marks the run "running".',
      inputSchema: { runId: z.string(), stepId: z.string() },
    },
    async ({ runId, stepId }) => {
      const { data: step, error } = await supabaseAdmin()
        .from('diagnostic_run_steps')
        .select('*')
        .eq('id', stepId)
        .eq('run_id', runId)
        .maybeSingle();
      if (error) return fail(error.message);
      if (!step) return fail('No such step on this run.');
      if (step.status !== 'validated') return fail(`Step is "${step.status}", expected "validated". Run pipeline_validate_step_result first.`);

      const [{ error: stepErr }, { error: runErr }] = await Promise.all([
        supabaseAdmin()
          .from('diagnostic_run_steps')
          .update({ resolved_result: step.proposed_result, status: 'resolved', updated_at: new Date().toISOString() })
          .eq('id', stepId),
        supabaseAdmin()
          .from('diagnostic_runs')
          .update({ status: 'running', updated_at: new Date().toISOString() })
          .eq('id', runId),
      ]);
      if (stepErr) return fail(stepErr.message);
      if (runErr) return fail(runErr.message);
      return text({ ok: true, stepId, runId, status: 'resolved' });
    },
  );

  server.registerTool(
    'pipeline_stop_run',
    {
      title: 'Stop a diagnostic run',
      description: 'Marks the run "stopped". The next time the paused browser call polls, it aborts with a clean error instead of waiting further.',
      inputSchema: { runId: z.string() },
    },
    async ({ runId }) => {
      const { data, error } = await supabaseAdmin()
        .from('diagnostic_runs')
        .update({ status: 'stopped', updated_at: new Date().toISOString() })
        .eq('id', runId)
        .select('*')
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail(`No diagnostic run with id ${runId}`);
      return text(data);
    },
  );

  server.registerTool(
    'pipeline_get_artifacts',
    {
      title: 'Get a run\'s captured step outputs',
      description: 'Every resolved step\'s result for a run, in order — the closest thing to "generated files/artifacts" this run produced.',
      inputSchema: { runId: z.string() },
    },
    async ({ runId }) => {
      const steps = await loadSteps(runId);
      const resolved = steps.filter(s => s.status === 'resolved').map(s => ({
        stepIndex: s.step_index,
        stepName: s.step_name,
        result: s.resolved_result,
      }));
      return text(resolved);
    },
  );

  server.registerTool(
    'pipeline_get_errors',
    {
      title: 'Get a run\'s validation/step errors',
      description: 'Every step that has a recorded error (rejected validation, or an explicit failure), in order.',
      inputSchema: { runId: z.string() },
    },
    async ({ runId }) => {
      const steps = await loadSteps(runId);
      const errored = steps.filter(s => s.error).map(s => ({ stepIndex: s.step_index, stepName: s.step_name, status: s.status, error: s.error }));
      return text(errored);
    },
  );

  server.registerTool(
    'pipeline_compare_runs',
    {
      title: 'Compare two diagnostic runs step by step',
      description: 'Pairs up steps by index and reports each pair\'s name/status/result side by side.',
      inputSchema: { runIdA: z.string(), runIdB: z.string() },
    },
    async ({ runIdA, runIdB }) => {
      const [stepsA, stepsB] = await Promise.all([loadSteps(runIdA), loadSteps(runIdB)]);
      const maxLen = Math.max(stepsA.length, stepsB.length);
      const rows = Array.from({ length: maxLen }, (_, i) => ({
        stepIndex: i,
        a: stepsA[i] ? { name: stepsA[i].step_name, status: stepsA[i].status, result: stepsA[i].resolved_result } : null,
        b: stepsB[i] ? { name: stepsB[i].step_name, status: stepsB[i].status, result: stepsB[i].resolved_result } : null,
      }));
      return text(rows);
    },
  );

  server.registerTool(
    'pipeline_find_divergence',
    {
      title: 'Find where two runs first diverge',
      description: 'The first step index where the two runs\' resolved results differ (by content), or where one run has a step the other doesn\'t.',
      inputSchema: { runIdA: z.string(), runIdB: z.string() },
    },
    async ({ runIdA, runIdB }) => {
      const [stepsA, stepsB] = await Promise.all([loadSteps(runIdA), loadSteps(runIdB)]);
      const maxLen = Math.max(stepsA.length, stepsB.length);
      for (let i = 0; i < maxLen; i++) {
        const a = stepsA[i];
        const b = stepsB[i];
        if (!a || !b) {
          return text({ divergedAtStepIndex: i, reason: !a ? `run A has no step ${i}` : `run B has no step ${i}` });
        }
        const aResult = JSON.stringify(a.resolved_result);
        const bResult = JSON.stringify(b.resolved_result);
        if (a.step_name !== b.step_name || aResult !== bResult) {
          return text({
            divergedAtStepIndex: i,
            reason: a.step_name !== b.step_name ? 'different step name' : 'different resolved result',
            a: { name: a.step_name, result: a.resolved_result },
            b: { name: b.step_name, result: b.resolved_result },
          });
        }
      }
      return text({ divergedAtStepIndex: null, reason: 'No divergence found — runs match up to the shorter run\'s length.' });
    },
  );
}
