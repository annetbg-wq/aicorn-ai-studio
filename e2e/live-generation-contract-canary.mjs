import process from 'process';

const scenarios = [
  {
    id: 'mobile-habit-tracker',
    skeletonId: 'mobile-app',
    brief: 'mobile-app habit tracker with daily streaks and quick check-ins',
  },
  {
    id: 'b2b-approval-workflow',
    skeletonId: 'b2b-operations-workspace',
    brief: 'b2b-operations-workspace approval and workflow tool for operations teams',
  },
  {
    id: 'creator-video-editor',
    skeletonId: 'creator-editor-workspace',
    brief: 'creator-editor-workspace AI video editor for timeline edits and publish flows',
  },
];

const supportedKeyNames = [
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
];

function firstConfiguredKey() {
  return supportedKeyNames.find(name => typeof process.env[name] === 'string' && process.env[name].trim().length > 0) ?? null;
}

function buildSkippedReport(reason, details = {}) {
  return {
    verdict: 'SKIPPED_REAL_LLM',
    reason,
    details,
    scenarios: scenarios.map(scenario => ({
      id: scenario.id,
      skeletonId: scenario.skeletonId,
      brief: scenario.brief,
      status: 'SKIPPED_REAL_LLM',
      result: reason,
    })),
    timestamp: new Date().toISOString(),
  };
}

async function main() {
  const enabled = process.env.AIC_LIVE_CONTRACT_CANARY_ENABLE === '1';
  const configuredKey = firstConfiguredKey();

  if (!enabled) {
    console.log(JSON.stringify(buildSkippedReport(
      'AIC_LIVE_CONTRACT_CANARY_ENABLE is not set to 1.',
      { required_env: 'AIC_LIVE_CONTRACT_CANARY_ENABLE=1', supported_keys: supportedKeyNames },
    ), null, 2));
    return;
  }

  if (!configuredKey) {
    console.log(JSON.stringify(buildSkippedReport(
      'No supported real LLM API key is configured for the contract canary.',
      { supported_keys: supportedKeyNames },
    ), null, 2));
    return;
  }

  console.log(JSON.stringify(buildSkippedReport(
    'Real LLM browser-driven canary execution is intentionally gated in this CLI script. Run the studio-attached canary flow with browser automation in an environment that provides a configured model slot.',
    { configured_key: configuredKey },
  ), null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    verdict: 'FAIL',
    reason: error instanceof Error ? error.message : String(error),
    timestamp: new Date().toISOString(),
  }, null, 2));
  process.exitCode = 1;
});