# AIC-RG Studio

## Eval Baseline

The eval gate uses committed benchmark baselines from `artifacts/eval-baselines/` and replays the existing `goldenIntents` suite through the real `SimpleGeneration -> ProtoPipeline` path.

### Capture or refresh the baseline (S0.1)

Создай `.env.local` с `DEEPSEEK_API_KEY=...` (session-only, в `.gitignore`, **НЕ коммить**):

```bash
echo "DEEPSEEK_API_KEY=sk-..." >> .env.local
```

Eval жёстко привязан к `deepseek/deepseek-v4-flash` и не использует ключи из Settings.
Все 6 агентных слотов (primary, fix, spec, build, qa, chat) сеются на эту пару.
Браузерный ConfigService/Settings этим путём не затрагивается и наоборот.

Run this from the repo root:

```bash
npm run eval:baseline
```

Defaults:

- uses `BENCHMARK_MODEL_ID=openai/gpt-4o-mini`
- runs both suites: `fast` (5 intents) and `full` (15 intents)
- writes `artifacts/eval-baselines/benchmark.fast.baseline.json`
- writes `artifacts/eval-baselines/benchmark.full.baseline.json`
- promotes the `full` run through `BaselineStore.save()` for the existing Supabase-backed history

Environment knobs:

- `OPENROUTER_API_KEY` or the provider-specific key for `BENCHMARK_PROVIDER`
- `BENCHMARK_MODEL_ID`
- `BENCHMARK_FIX_MODEL_ID`
- `BENCHMARK_PROVIDER` (defaults to `openrouter`)
- `BENCHMARK_SUITE=fast|full|all` when you only want one suite

### Run the gate locally

```bash
npm run eval:gate
```

This defaults to the `fast` suite and fails with a non-zero exit code only when `BenchmarkGate` reports a `REGRESSION`.

### Update workflow

1. Refresh the baseline with `npm run eval:baseline`.
2. Review the JSON diff in `artifacts/eval-baselines/`.
3. Confirm the fast gate still passes with `npm run eval:gate`.
4. Commit the updated baseline artifacts together with any intentional quality change.
