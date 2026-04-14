// Autonomous studio smoke: login → navigate → submit "simple counter" → watch for ready_set.
const { chromium } = require('playwright');

const STUDIO_URL = 'http://localhost:5183';
const PROMPT = 'simple counter';
const TOTAL_TIMEOUT_MS = 180_000; // 3 minutes for ready_set

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();

  const lines = [];
  const errors = [];
  let readySeen = false;
  let readySeenAt = 0;
  const startMs = Date.now();
  const READY_REGEX = /\[preview-timeline\] ready_set/;

  const push = (src, msg) => {
    const t = ((Date.now() - startMs) / 1000).toFixed(1) + 's';
    lines.push(`[${t}] ${src} ${msg}`);
    if (!readySeen && READY_REGEX.test(msg)) {
      readySeen = true;
      readySeenAt = Date.now() - startMs;
    }
  };

  page.on('console', (m) => push('[console.' + m.type() + ']', m.text()));
  page.on('pageerror', (e) => {
    const m = String(e && e.message ? e.message : e);
    errors.push(m);
    push('[pageerror]', m);
  });

  const snapshot = async (label) => {
    const s = await page.evaluate(() => ({
      textareas: document.querySelectorAll('textarea').length,
      buttons: Array.from(document.querySelectorAll('button')).slice(0, 40).map((b) => ({
        text: (b.innerText || '').trim().slice(0, 60),
        title: b.getAttribute('title') || '',
        cls: (b.className || '').toString().slice(0, 80),
      })),
      body: (document.body.innerText || '').slice(0, 600),
    })).catch(() => null);
    console.log(`--- SNAPSHOT [${label}] ---`);
    if (!s) { console.log('(eval failed)'); return; }
    console.log('textareas:', s.textareas);
    console.log('body:', s.body.replace(/\n+/g, ' | '));
    s.buttons.slice(0, 20).forEach((b, i) => console.log(`  btn[${i}] "${b.text}" title="${b.title}"`));
  };

  try {
    console.log('Navigating…');
    await page.goto(STUDIO_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // 1. Handle the login gate if present.
    const loginBtn = page.getByRole('button', { name: /Test Login/i });
    if (await loginBtn.count().catch(() => 0)) {
      console.log('Clicking Test Login…');
      await loginBtn.first().click();
      await page.waitForTimeout(2500);
    }

    // 2. Wait for any textarea. If it does not show up on this view, dump DOM
    //    and try likely nav entry-points.
    let textarea = page.locator('textarea').first();
    const waitForTextarea = async (timeoutMs) => {
      try {
        await textarea.waitFor({ state: 'visible', timeout: timeoutMs });
        return true;
      } catch { return false; }
    };

    if (!(await waitForTextarea(5_000))) {
      await snapshot('post-login-no-textarea');
      // Try common entry routes: "New Project", "Engine", "Studio", "Start building"
      const candidates = [
        /New project/i,
        /Новый проект/i,
        /Start building/i,
        /Engine/i,
        /Studio/i,
        /Create/i,
      ];
      for (const rx of candidates) {
        const b = page.getByRole('button', { name: rx }).first();
        if (await b.count().catch(() => 0)) {
          console.log('Clicking nav candidate:', rx.source);
          await b.click().catch(() => {});
          await page.waitForTimeout(1500);
          if (await waitForTextarea(5_000)) break;
        }
      }
    }

    // 3. After any additional nav, try one more snapshot + selector attempts.
    if (!(await waitForTextarea(8_000))) {
      await snapshot('still-no-textarea');
      // Try clicking sidebar icons by title
      const sidebarTitles = [/engine/i, /build/i, /chat/i, /studio/i];
      for (const rx of sidebarTitles) {
        const el = page.locator(`button[title*="${rx.source}" i]`).first();
        if (await el.count().catch(() => 0)) {
          console.log('Clicking sidebar by title:', rx.source);
          await el.click().catch(() => {});
          await page.waitForTimeout(1500);
          if (await waitForTextarea(4_000)) break;
        }
      }
    }

    // If there is any modal open that might cover the textarea (mode-select),
    // try to pick a mode.
    if (!(await waitForTextarea(4_000))) {
      await snapshot('mode-select-probe');
      const modeBtns = [/Landing/i, /App/i, /Superapp/i];
      for (const rx of modeBtns) {
        const b = page.getByRole('button', { name: rx }).first();
        if (await b.count().catch(() => 0)) {
          console.log('Clicking mode:', rx.source);
          await b.click().catch(() => {});
          await page.waitForTimeout(1500);
          if (await waitForTextarea(4_000)) break;
        }
      }
    }

    if (!(await waitForTextarea(4_000))) {
      await snapshot('final-no-textarea');
      throw new Error('no textarea after nav attempts');
    }

    console.log('Textarea found. Filling prompt…');
    textarea = page.locator('textarea').first();
    await textarea.click();
    await textarea.fill(PROMPT);

    // Submit — prefer Enter (onKeyDown handler fires onSend)
    console.log('Submitting prompt via Enter…');
    await textarea.press('Enter');

    console.log('Watching for ready_set up to 3 minutes…');
    const deadline = startMs + TOTAL_TIMEOUT_MS;
    while (!readySeen && Date.now() < deadline) {
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    errors.push('DRIVE_ERROR: ' + String(e && e.message ? e.message : e));
  }

  // Read final __build_id.ts
  let buildIdFromFile = null;
  try {
    buildIdFromFile = await page.evaluate(async () => {
      const r = await fetch('/__read_preview?path=__build_id.ts');
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.content ? j.content : null;
    });
  } catch {}

  const timeline = lines.filter((l) => l.includes('[preview-timeline]'));
  const preview = lines.filter((l) => l.includes('[preview]') || l.includes('[preview-timeline]'));
  const simpleGen = lines.filter((l) => l.includes('[SimpleGeneration]'));

  console.log('\n=== STUDIO SMOKE RESULT ===');
  console.log('ready_set_seen:', readySeen, readySeen ? `(at ${readySeenAt}ms)` : '');
  console.log('errors:', errors.length);
  errors.forEach((e) => console.log('  - ' + e));
  console.log('\npreview-timeline lines (' + timeline.length + '):');
  timeline.forEach((l) => console.log('  ' + l));
  console.log('\npreview + preview-timeline lines (' + preview.length + '):');
  preview.forEach((l) => console.log('  ' + l));
  console.log('\n[SimpleGeneration] lines (' + simpleGen.length + '):');
  simpleGen.forEach((l) => console.log('  ' + l));
  console.log('\ntotal console lines captured:', lines.length);
  console.log('last 30 lines (any source):');
  lines.slice(-30).forEach((l) => console.log('  ' + l));
  console.log('\n__build_id.ts after run:');
  console.log(buildIdFromFile || '(unavailable)');

  await browser.close();
  process.exit(readySeen ? 0 : 1);
})();
