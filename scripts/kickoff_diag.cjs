const { chromium } = require("@playwright/test");
const BASE = "http://localhost:5183";
const TREND_NICHES_MODEL = JSON.stringify({ generatedAt: new Date().toISOString(), taskInterest: null, daily: [{ id: "trend-c1", theme: "dark-slate", categories: ["ai_automation"], en: { title: "AI Meeting Summarizer", description: "Auto-summarize meetings", marketAngle: "Async comms", whyInteresting: "Saves hours" }, ru: { title: "ИИ-суммаризатор", description: "Авто-резюме встреч", marketAngle: "Асинхронно", whyInteresting: "Экономия времени" } }], weekly: [], monthly: [] });
const BLUEPRINT = JSON.stringify({ id:"idea-001", appName:"Summarizer", description:"Auto-summarize", theme:"dark-slate", targetUser:"eng", layout:{type:"single",navigation:"none"}, pages:[{path:"/",name:"App",file:"App.tsx",purpose:"Main",isMainScreen:true,showInNav:false,uiSpec:"list",keyElements:["list"]}], dataModel:{entities:[],sharedState:"local"}, criticalUiRules:[], shadcnComponents:[], icons:[], fileArchitecture:[{path:"src/App.tsx",role:"page",purpose:"Main"}], premiumUiDirectives:[], uxPatterns:{emptyStates:false,loadingSkeletons:false,searchAndFilter:false,animations:"none"}, responsiveness:{primaryDevice:"desktop",mobileFirst:false,maxWidth:"max-w-2xl"}, authFlow:{type:"none",provider:"",onboardingSteps:[]}, monetization:{model:"free",paywall:{trigger:"",limits:[],upgradeMessage:""}}, databaseSchema:{sql:"",tables:[]}, aiLogic:{features:[]}, packageSummary:"Simple" });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on("console", msg => {
    const t = msg.text();
    if (/kickoff|awaiting|build_start|fast.start|onSend|error|Error|failed/i.test(t)) {
      console.log("  [browser] " + t.slice(0, 300));
    }
  });

  try {
    await page.route("http://127.0.0.1:3000/dev-agent-mode", function(r) { r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({mode:"codex",provider:"codex"}) }); });
    await page.route("http://127.0.0.1:3000/chat", async function(r) { await r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ content:[{text: BLUEPRINT}] }) }); });
    await page.route("**/auth/v1/**", function(r) { r.fulfill({ status:200, contentType:"application/json", body:"{}" }); });
    await page.route("**/rest/v1/**", function(r) { r.fulfill({ status:200, contentType:"application/json", body:"[]" }); });
    await page.route("**/functions/v1/llm-proxy", async function(r) { await r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({choices:[{message:{content:"{}"}}]}) }); });

    await page.goto(BASE, { waitUntil:"domcontentloaded", timeout:15000 });
    await page.evaluate(function(m) {
      localStorage.setItem("AIC_DEV_AUTH_BYPASS","1");
      localStorage.setItem("OPENROUTER_API_KEY","audit-key");
      localStorage.setItem("superadmin_dev_agent_provider","codex");
      localStorage.setItem("aic_trend_niches", m);
      localStorage.removeItem("CURRENT_PROJECT_ID");
      localStorage.removeItem("aic_projects_meta");
    }, TREND_NICHES_MODEL);
    await page.reload({ waitUntil:"domcontentloaded", timeout:15000 });
    await page.waitForFunction(function() { return document.getElementById("root") && document.getElementById("root").children.length > 0; }, { timeout:10000 });

    const nav = page.locator('[title="Трендовые ниши"]').or(page.getByRole("button",{name:"Трендовые ниши"}));
    await nav.waitFor({ state:"visible", timeout:10000 });
    await nav.click();
    await page.waitForFunction(function() { return document.body.innerText.includes("В работу"); }, { timeout:15000 });
    console.log("  ✓ Trend Niches loaded");

    const buildBtn = page.locator("button").filter({ hasText:"В работу" }).first();
    await buildBtn.click();
    console.log("  ✓ Clicked В работу");

    await page.waitForTimeout(5000);
    
    var bodyText = await page.evaluate(function() { return document.body.innerText.slice(0, 800); });
    console.log("\n  --- PAGE TEXT AFTER PACKAGING ---\n" + bodyText);
    
    var btns = await page.evaluate(function() {
      var all = Array.from(document.querySelectorAll("button"));
      return all.map(function(b) { return { text: (b.textContent||"").trim().slice(0,40), disabled: b.disabled, classes: b.className.slice(0,60) }; });
    });
    console.log("\n  --- BUTTONS ---");
    btns.forEach(function(b) { console.log("    [" + (b.disabled?"DISABLED":"enabled") + '] "' + b.text + '" :: ' + b.classes); });

    var inputs = await page.evaluate(function() {
      var ta = Array.from(document.querySelectorAll("textarea,input"));
      return ta.map(function(i) { return { tag: i.tagName, value: (i.value||"").slice(0,100), placeholder: (i.placeholder||"").slice(0,100) }; });
    });
    console.log("\n  --- INPUTS ---");
    inputs.forEach(function(i) { console.log("    <" + i.tag + "> value=" + JSON.stringify(i.value) + " placeholder=" + JSON.stringify(i.placeholder)); });

  } catch(e) {
    console.log("  Error: " + e.message);
  } finally {
    await browser.close();
  }
}
run();
