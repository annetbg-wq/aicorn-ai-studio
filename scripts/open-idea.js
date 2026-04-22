const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  await page.goto('http://localhost:5183', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Click "Test Login (localhost)" if on auth screen
  const testLogin = await page.$('button:has-text("Test Login")');
  if (testLogin) {
    console.log('Clicking Test Login...');
    await testLogin.click();
    await page.waitForTimeout(3000);
  }

  // Click "+ Новый проект" button on the dashboard
  const newProjectBtn = await page.$('button:has-text("Новый проект")');
  if (newProjectBtn) {
    console.log('Clicking New Project...');
    await newProjectBtn.click();
    await page.waitForTimeout(2000);
  } else {
    // Try clicking System Engine card to enter engine view
    const engineCard = await page.$('text=System Engine');
    if (engineCard) {
      console.log('Clicking System Engine...');
      await engineCard.click();
      await page.waitForTimeout(2000);
    }
  }

  await page.screenshot({ path: 'scripts/debug-after-newproject.png' });
  console.log('Screenshot after new project.');

  const prompt = [
    'Create app: "Pregnant BFF" — a friendly chat companion for a pregnant woman.',
    'The BFF is a young girl who has never given birth and is not a doctor,',
    'so she gives NO medical advice. Instead she distracts from worries:',
    'chatty about life, makes jokes, gossips about men and relationships,',
    'sends compliments and memes-style quips.',
    'App screens:',
    '1. Chat screen — BFF avatar, message bubbles, text input, send button.',
    '2. Mood selector — 3 modes: Happy (emojis, jokes), Caring (gentle support), Energetic (hype).',
    '3. Quick topic chips: "Men drama", "Baby names", "Cravings", "Self-care day", "Funny fails".',
    'Design: warm rose-peach gradient, rounded bubbles, soft shadows. Mobile-first max-w-md.',
    'BFF messages are pre-scripted witty responses — no real AI calls needed.',
    'The BFF always ends her reply with a playful emoji.',
    'If user asks medical question, BFF says: "Girl I am not a doctor, ask your ob-gyn! But wanna talk about baby names instead?"',
  ].join(' ');

  // Wait for textarea to become visible
  await page.waitForSelector('textarea', { state: 'visible', timeout: 15000 }).catch(() => null);
  const textarea = await page.$('textarea');
  if (textarea) {
    console.log('Found textarea, filling prompt...');
    await textarea.click({ force: true });
    await page.waitForTimeout(500);
    await textarea.fill(prompt);
    console.log('Prompt filled.');
    await page.waitForTimeout(1500);
    await page.keyboard.press('Control+Enter');
    console.log('Sent with Ctrl+Enter.');
  } else {
    console.log('No textarea found.');
    await page.screenshot({ path: 'scripts/debug-no-textarea.png' });
    const text = await page.evaluate(() => document.body.innerText.slice(0, 600));
    console.log('Page text:', text);
  }

  // Keep browser open for user to watch generation
  console.log('Browser stays open for 3 minutes...');
  await page.waitForTimeout(180_000);
  await browser.close();
})().catch(e => {
  console.error('Playwright error:', e.message);
  process.exit(1);
});

