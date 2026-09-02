// @ts-check
'use strict';

const crypto = require('crypto');
const fsPromises = require('fs/promises');
const path = require('path');

const DEFAULT_ARCHIVE_ROOT = path.resolve(process.cwd(), '.prototype-runs');
const DEFAULT_MAX_RUNS = 10;

function assertApiMode(value) {
  if (value !== 'mock' && value !== 'staging') {
    throw new Error(`prototype API mode must be explicitly "mock" or "staging"; received ${JSON.stringify(value)}`);
  }
  return value;
}

function assertSkeletonId(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('prototype run requires an explicit skeletonId so preview workspace isolation uses the backend atomic wipe path');
  }
  return value.trim();
}

function assertBuildId(value) {
  if (typeof value !== 'string' || !/^[\w-]{8,}$/.test(value.trim())) {
    throw new Error(`prototype run requires a valid buildId; received ${JSON.stringify(value)}`);
  }
  return value.trim();
}

function assertSessionId(value) {
  if (typeof value !== 'string' || value.trim().length < 16 || value.trim().length > 200) {
    throw new Error('prototype run requires the preview session bound to the generated build');
  }
  return value.trim();
}

function fingerprintSession(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

function makeRunIdentity() {
  const uuid = crypto.randomUUID();
  return {
    runId: `prototype-${uuid}`,
    sessionId: `prototype-session-${crypto.randomUUID()}`,
  };
}

async function writeJson(filePath, value) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function cleanupRollingArchive(root = DEFAULT_ARCHIVE_ROOT, maxRuns = DEFAULT_MAX_RUNS) {
  await fsPromises.mkdir(root, { recursive: true });
  const entries = await fsPromises.readdir(root, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(root, entry.name);
    const stat = await fsPromises.stat(fullPath);
    dirs.push({ fullPath, mtimeMs: stat.mtimeMs });
  }
  dirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const entry of dirs.slice(Math.max(0, maxRuns))) {
    await fsPromises.rm(entry.fullPath, { recursive: true, force: true });
  }
}

function pageFingerprintSnapshot() {
  return {
    url: location.href,
    text: document.body?.innerText ?? '',
    html: document.body?.innerHTML ?? '',
  };
}

async function detectDeadButtons(page) {
  const buttons = page.locator('button:visible:not([disabled]):not([data-qa-static])');
  const count = await buttons.count();
  const deadButtons = [];
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const label = ((await button.innerText().catch(() => '')) || (await button.getAttribute('aria-label')) || `button#${index}`).trim();
    const before = await page.evaluate(pageFingerprintSnapshot);
    let clickError = null;
    try {
      await button.click({ timeout: 2_000 });
      await page.waitForTimeout(250);
    } catch (error) {
      clickError = error instanceof Error ? error.message : String(error);
    }
    const after = await page.evaluate(pageFingerprintSnapshot).catch(() => before);
    if (clickError || JSON.stringify(before) === JSON.stringify(after)) {
      deadButtons.push({ label, clickError });
    }
  }
  return deadButtons;
}

async function findBrokenLinks(page, previewUrl) {
  const hrefs = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')).filter(Boolean));
  const unique = Array.from(new Set(hrefs));
  const broken = [];
  for (const href of unique) {
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    const url = new URL(href, previewUrl);
    if (url.origin !== new URL(previewUrl).origin) continue;
    const response = await page.request.get(url.toString(), { failOnStatusCode: false });
    if (response.status() >= 400) broken.push({ href, status: response.status() });
  }
  return broken;
}

async function runKeyFlows(page, flows = []) {
  const results = [];
  for (const flow of flows) {
    const startedAt = Date.now();
    try {
      for (const step of flow.steps || []) {
        if (step.action === 'click') await page.locator(step.selector).click();
        else if (step.action === 'fill') await page.locator(step.selector).fill(step.value ?? '');
        else if (step.action === 'press') await page.locator(step.selector).press(step.key ?? 'Enter');
        else if (step.action === 'expectText') {
          const actual = await page.locator(step.selector).innerText();
          if (!actual.includes(step.value ?? '')) throw new Error(`Expected ${step.selector} to include ${JSON.stringify(step.value)}, got ${JSON.stringify(actual)}`);
        } else if (step.action === 'expectVisible') {
          if (!(await page.locator(step.selector).isVisible())) throw new Error(`Expected ${step.selector} to be visible`);
        } else {
          throw new Error(`Unknown QA step action: ${step.action}`);
        }
      }
      results.push({ name: flow.name, status: 'passed', durationMs: Date.now() - startedAt });
    } catch (error) {
      results.push({ name: flow.name, status: 'failed', durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

function buildArchiveManifest({ runId, buildId, sessionId, apiMode, skeletonId, maxRuns, createdAt, previewPath }) {
  return {
    schemaVersion: 2,
    runId,
    buildId,
    sessionFingerprint: fingerprintSession(sessionId),
    apiMode,
    skeletonId,
    archivePolicy: { type: 'rolling', maxRuns },
    createdAt,
    previewPath,
  };
}

function qaSummary(report) {
  return {
    passed: report.passed,
    consoleErrorCount: report.consoleErrors.length,
    pageErrorCount: report.pageErrors.length,
    brokenLinkCount: report.brokenLinks.length,
    deadButtonCount: report.deadButtons.length,
    failedFlowCount: report.flows.filter(flow => flow.status === 'failed').length,
  };
}

async function persistServerRun({ page, baseUrl, buildId, sessionId, apiMode, skeletonId, kind, retention, report }) {
  const response = await page.request.post(
    `${baseUrl.replace(/\/$/, '')}/api/prototype-runs/${buildId}`,
    {
      headers: { 'X-Preview-Session': sessionId },
      data: {
        apiMode,
        skeletonId,
        kind,
        retention,
        status: report.passed ? 'ready' : 'qa_failed',
        qaSummary: qaSummary(report),
      },
      failOnStatusCode: false,
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok()) {
    throw new Error(`server prototype-run registry failed (${response.status()}): ${JSON.stringify(body)}`);
  }
  if (body?.runId !== buildId || body?.buildId !== buildId) {
    throw new Error(`server prototype-run registry returned mismatched identity: ${JSON.stringify(body)}`);
  }
  return body;
}

async function runQaChecks({ page, runId, buildId, sessionId, apiMode, skeletonId, baseUrl, flows, archiveRoot, maxRuns, createdAt, kind, retention }) {
  const runDir = path.join(archiveRoot, runId);
  const manifestPath = path.join(runDir, 'manifest.json');
  const qaReportPath = path.join(runDir, 'qa-report.json');
  const previewPath = `/preview/${buildId}/`;
  const previewUrl = `${baseUrl.replace(/\/$/, '')}${previewPath}?previewSession=${encodeURIComponent(sessionId)}`;
  const commonManifest = buildArchiveManifest({
    runId,
    buildId,
    sessionId,
    apiMode,
    skeletonId,
    maxRuns,
    createdAt,
    previewPath,
  });

  await writeJson(manifestPath, { ...commonManifest, status: 'qa_running' });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    const response = await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    if (!response || response.status() >= 400) {
      throw new Error(`preview load failed: ${response?.status() ?? 'no response'}`);
    }

    const brokenLinks = await findBrokenLinks(page, previewUrl);
    const deadButtons = await detectDeadButtons(page);
    await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    const flowResults = await runKeyFlows(page, flows);
    const failedFlows = flowResults.filter(item => item.status === 'failed');

    const report = {
      schemaVersion: 2,
      runId,
      buildId,
      apiMode,
      skeletonId,
      previewPath,
      checkedAt: new Date().toISOString(),
      consoleErrors,
      pageErrors,
      brokenLinks,
      deadButtons,
      flows: flowResults,
      passed: consoleErrors.length === 0 && pageErrors.length === 0 && brokenLinks.length === 0 && deadButtons.length === 0 && failedFlows.length === 0,
    };
    await writeJson(qaReportPath, report);
    await persistServerRun({
      page,
      baseUrl,
      buildId,
      sessionId,
      apiMode,
      skeletonId,
      kind,
      retention,
      report,
    });
    await writeJson(manifestPath, {
      ...commonManifest,
      completedAt: new Date().toISOString(),
      status: report.passed ? 'ready' : 'qa_failed',
      qaReport: path.basename(qaReportPath),
    });
    await cleanupRollingArchive(archiveRoot, maxRuns);
    return { runId, buildId, manifestPath, qaReportPath, previewUrl, report };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJson(manifestPath, {
      ...commonManifest,
      completedAt: new Date().toISOString(),
      status: 'qa_failed',
      error: message,
    });
    await cleanupRollingArchive(archiveRoot, maxRuns);
    throw error;
  }
}

async function recordExistingPrototypeRunQa({
  page,
  buildId,
  sessionId,
  apiMode,
  skeletonId,
  baseUrl = process.env.STUDIO_URL || 'http://localhost:5183',
  flows = [],
  archiveRoot = DEFAULT_ARCHIVE_ROOT,
  maxRuns = DEFAULT_MAX_RUNS,
  kind = 'reference',
  retention = 'rolling',
}) {
  const explicitApiMode = assertApiMode(apiMode);
  const explicitSkeletonId = assertSkeletonId(skeletonId);
  const explicitBuildId = assertBuildId(buildId);
  const explicitSessionId = assertSessionId(sessionId);
  const createdAt = new Date().toISOString();

  return runQaChecks({
    page,
    runId: explicitBuildId,
    buildId: explicitBuildId,
    sessionId: explicitSessionId,
    apiMode: explicitApiMode,
    skeletonId: explicitSkeletonId,
    baseUrl,
    flows,
    archiveRoot,
    maxRuns,
    createdAt,
    kind,
    retention,
  });
}

async function runPrototypeQa({ page, files, apiMode, skeletonId, baseUrl = process.env.STUDIO_URL || 'http://localhost:5183', flows = [], archiveRoot = DEFAULT_ARCHIVE_ROOT, maxRuns = DEFAULT_MAX_RUNS }) {
  const explicitApiMode = assertApiMode(apiMode);
  const explicitSkeletonId = assertSkeletonId(skeletonId);
  if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length === 0) {
    throw new Error('prototype run requires a non-empty files map');
  }

  const { runId, sessionId } = makeRunIdentity();
  const runDir = path.join(archiveRoot, runId);
  const createdAt = new Date().toISOString();
  const manifestPath = path.join(runDir, 'manifest.json');
  const previewPath = `/preview/${runId}/`;
  const commonManifest = buildArchiveManifest({
    runId,
    buildId: runId,
    sessionId,
    apiMode: explicitApiMode,
    skeletonId: explicitSkeletonId,
    maxRuns,
    createdAt,
    previewPath,
  });

  await writeJson(manifestPath, { ...commonManifest, status: 'compiling' });

  const compileResponse = await page.request.post(`${baseUrl.replace(/\/$/, '')}/api/preview/${runId}/compile`, {
    headers: { 'X-Preview-Session': sessionId },
    data: { files, sessionId, skeletonId: explicitSkeletonId },
    timeout: 120_000,
  });
  const compileBody = await compileResponse.json().catch(() => null);
  if (!compileResponse.ok() || !compileBody?.success) {
    const error = `compile failed (${compileResponse.status()}): ${JSON.stringify(compileBody)}`;
    await writeJson(manifestPath, { ...commonManifest, status: 'failed', error });
    await cleanupRollingArchive(archiveRoot, maxRuns);
    throw new Error(error);
  }

  const result = await runQaChecks({
    page,
    runId,
    buildId: runId,
    sessionId,
    apiMode: explicitApiMode,
    skeletonId: explicitSkeletonId,
    baseUrl,
    flows,
    archiveRoot,
    maxRuns,
    createdAt,
    kind: 'fixture',
    retention: 'rolling',
  });

  return { ...result, sessionId };
}

module.exports = {
  assertApiMode,
  assertBuildId,
  assertSessionId,
  assertSkeletonId,
  cleanupRollingArchive,
  recordExistingPrototypeRunQa,
  runPrototypeQa,
};
