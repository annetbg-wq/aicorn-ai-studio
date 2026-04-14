const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1600, height: 1000 } }).then(c => c.newPage());
  await page.goto('http://localhost:5183', { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2000);

  const snap = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).slice(0, 60).map((b) => ({
      text: (b.innerText || '').trim().slice(0, 80),
      title: b.getAttribute('title') || '',
      ariaLabel: b.getAttribute('aria-label') || '',
      classes: (b.className || '').toString().slice(0, 100),
    }));
    const textareaCount = document.querySelectorAll('textarea').length;
    const inputCount = document.querySelectorAll('input').length;
    const h = Array.from(document.querySelectorAll('h1,h2,h3')).map(el => el.innerText.trim()).slice(0, 20);
    const bodyText = (document.body.innerText || '').slice(0, 1500);
    return { buttons, textareaCount, inputCount, headings: h, bodyText };
  });

  console.log('textareaCount:', snap.textareaCount);
  console.log('inputCount:', snap.inputCount);
  console.log('headings:', snap.headings);
  console.log('body (first 1500 chars):');
  console.log(snap.bodyText);
  console.log('\nbuttons:');
  snap.buttons.forEach((b, i) => {
    console.log(`  [${i}] text="${b.text}" title="${b.title}" aria="${b.ariaLabel}" cls="${b.classes}"`);
  });

  await browser.close();
})();
