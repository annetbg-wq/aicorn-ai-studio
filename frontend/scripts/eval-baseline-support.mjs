export function artifactFromRun(
  suite,
  report,
  aggregate,
) {
  return {
    version: 1,
    kind: 'benchmark-baseline',
    suite,
    generatedAt: new Date().toISOString(),
    source: {
      runId: report.runId,
      modelId: report.modelId,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
    },
    aggregate,
    summary: report.summary,
  };
}

export async function captureBaselineSuite({
  suite,
  report,
  buildAggregateBaseline,
  baselineArtifactPath,
  writeJson,
  promoteAsBaseline,
}) {
  const aggregate = buildAggregateBaseline(report);
  const artifactPath = baselineArtifactPath(suite);
  writeJson(artifactPath, artifactFromRun(suite, report, aggregate));

  if (suite === 'full') {
    await promoteAsBaseline(report);
    console.log('[eval:baseline] Promoted full-suite report through BaselineStore.save()');
  }

  return { aggregate, artifactPath };
}
