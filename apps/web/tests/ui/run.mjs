import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

const BASE = process.env.UZTRADE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUTPUT = path.resolve("tests/ui/output");
const DEMO = path.resolve("public/demo");
const TIMEOUT = 60_000;
const viewports = [
  { name: "desktop", width: 1366, height: 800, isMobile: false, hasTouch: false },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];

await mkdir(OUTPUT, { recursive: true });

function cleanMessage(value) {
  return String(value).replace(/\s+/g, " ").slice(0, 500);
}

async function waitIdle(page) {
  await page.waitForFunction(
    () => !document.querySelector(".caret, .thinking, .working"),
    { timeout: TIMEOUT },
  );
  await page.waitForNetworkIdle({ idleTime: 300, timeout: TIMEOUT });
}

async function waitReply(page, previous) {
  await page.waitForFunction((count) => document.querySelectorAll('.msg[data-who]:not([data-who="user"])').length > count, { timeout: TIMEOUT }, previous);
  await waitIdle(page);
}

async function send(page, message) {
  const previous = await page.$$eval('.msg[data-who]:not([data-who="user"])', (els) => els.length);
  const composer = await page.waitForSelector("#trade-query", { visible: true, timeout: TIMEOUT });
  await composer.click({ clickCount: 3 });
  await composer.type(message);
  await page.click('button[aria-label="Send"]');
  await waitReply(page, previous);
}

async function clickText(page, selector, text) {
  const clicked = await page.evaluate(({ selector, text }) => {
    const match = [...document.querySelectorAll(selector)].find((node) => node.textContent?.trim().includes(text));
    if (!(match instanceof HTMLElement)) return false;
    match.click();
    return true;
  }, { selector, text });
  assert(clicked, `Could not find ${selector} containing ${JSON.stringify(text)}`);
}

async function fresh(page) {
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: TIMEOUT });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle2", timeout: TIMEOUT });
  await page.waitForSelector(".start-title", { timeout: TIMEOUT });
}

async function shot(page, viewport, scenario) {
  await page.screenshot({ path: path.join(OUTPUT, `${scenario}-${viewport}.png`), fullPage: true });
}

async function findDemo(procedureId, label = "") {
  const dir = path.join(DEMO, procedureId);
  const scenario = JSON.parse(await readFile(path.resolve("modules/demo/data", `scenario-${procedureId}.json`), "utf8"));
  const wanted = label.replace(/^Upload\s+/i, "").trim().toLowerCase();
  const matched = scenario.documents.find((doc) => [doc.title, ...(doc.labels ?? [])].some((value) => value.toLowerCase() === wanted));
  if (matched) return path.join(dir, matched.file);
  const names = await readdir(dir);
  const file = names.find((name) => /\.(png|jpe?g|pdf)$/i.test(name));
  assert(file, `No demo document for procedure ${procedureId}`);
  return path.join(dir, file);
}

const scenarios = [
  ["a-start", async (page, viewport) => {
    await fresh(page);
    assert.equal(await page.$eval(".start-title", (el) => el.textContent?.trim()), "What are you moving?");
    assert(await page.$("#trade-query"));
    assert.equal(await page.$$eval(".starter", (els) => els.length), 4);
    for (let i = 0; i < 4; i += 1) {
      if (i) await fresh(page);
      const expected = await page.$$eval(".starter-text", (els, index) => els[index]?.textContent?.trim(), i);
      const previous = await page.$$eval('.msg[data-who]:not([data-who="user"])', (els) => els.length);
      await page.$$eval(".starter", (els, index) => els[index]?.click(), i);
      await waitReply(page, previous);
      assert.equal(await page.$$eval('.msg[data-who="user"]', (els, text) => els.at(-1)?.textContent?.includes(text), expected), true);
    }
    await shot(page, viewport, "a-start");
  }],
  ["b-explore", async (page, viewport) => {
    await fresh(page);
    await send(page, "I want to import yoghurt from Almaty");
    assert.equal(await page.$$eval('.msg[data-who="assistant"] .msg-text p', (els) => els.length), 1);
    assert((await page.$$eval(".ways .way", (els) => els.length)) > 0);
    assert(await page.$('.facts .fact[data-state="asking"]'));
    assert((await page.$$eval(".msg-options .chip", (els) => els.length)) > 0);
    const previous = await page.$$eval('.msg[data-who]:not([data-who="user"])', (els) => els.length);
    await page.click(".ways .way");
    await waitReply(page, previous);
    const filled = await page.$('.facts .fact[data-state="done"] .fact-edit');
    if (filled) {
      await filled.click();
      assert((await page.$eval("#trade-query", (el) => el.value)).length > 0);
    }
    await shot(page, viewport, "b-explore");
  }],
  ["c-estimate", async (page, viewport) => {
    await fresh(page);
    await send(page, "How long does it take to export tea by train from Tashkent to Almaty?");
    assert(await page.$(".ways"));
    assert((await page.$$eval(".ways .way-bar", (els) => els.length)) > 0);
    assert((await page.$$eval(".msg-options .chip", (els) => els.length)) > 0);
    await shot(page, viewport, "c-estimate");
  }],
  ["d-cases", async (page, viewport) => {
    await fresh(page);
    await send(page, "Which shipments are waiting on me?");
    assert(await page.$(".cases"));
    const links = await page.$$eval('.cases a[href^="/?case=UZ-"]', (els) => els.length);
    assert(links > 0, "No case rows linking to a case");
    await shot(page, viewport, "d-cases");
  }],
  ["e-knowledge", async (page, viewport) => {
    await fresh(page);
    await send(page, "Who issues the phytosanitary certificate for tea?");
    assert((await page.$eval('.msg[data-who="assistant"] .msg-text', (el) => el.textContent?.trim().length ?? 0)) > 0);
    assert((await page.$$eval(".sources .source", (els) => els.length)) > 0);
    await shot(page, viewport, "e-knowledge");
  }],
  ["f-intake", async (page, viewport, state) => {
    await fresh(page);
    await send(page, "I want to export dried apricots");
    for (let turns = 0; turns < 12 && !(await page.$(".plan")); turns += 1) {
      const chip = await page.$(".msg-options .chip");
      assert(chip, `Intake stalled before plan after ${turns} answers`);
      const previous = await page.$$eval('.msg[data-who]:not([data-who="user"])', (els) => els.length);
      await chip.click();
      await waitReply(page, previous);
    }
    assert(await page.$(".plan"), "Plan did not appear");
    await clickText(page, ".plan button", "Open the case");
    await page.waitForFunction(() => /^\?case=UZ-\d{4}-\d{4}$/.test(location.search), { timeout: TIMEOUT });
    await waitIdle(page);
    state.caseUrl = page.url();
    state.caseId = new URL(page.url()).searchParams.get("case");
    assert(await page.$(`.casecard[aria-label="Case ${state.caseId}"]`));
    assert(await page.$("#current-step"));
    const thread = await page.$eval('[role="log"]', (el) => el.textContent);
    assert(thread.includes(`Opened as case ${state.caseId}`));
    await shot(page, viewport, "f-intake");
  }],
  ["g-step", async (page, viewport, state) => {
    assert(state.caseUrl, "Intake scenario did not open a case");
    await page.goto(state.caseUrl, { waitUntil: "networkidle2", timeout: TIMEOUT });
    await waitIdle(page);
    const procedureId = await page.evaluate(async (caseId) => {
      const response = await fetch(`/api/cases/${caseId}/assistant`);
      const data = await response.json();
      return String(data.procedureId);
    }, state.caseId);
    const input = await page.$('#current-step input[type="file"]');
    if (input) {
      const label = await input.evaluate((el) => el.getAttribute("aria-label") ?? "");
      await input.uploadFile(await findDemo(procedureId, label));
      await waitIdle(page);
    }
    for (const box of await page.$$("#current-step .nf-confirm input:not(:checked)")) {
      await box.click();
      await waitIdle(page);
    }
    const complete = await page.$("#current-step .block-actions button:not([disabled])");
    if (complete) {
      const before = await page.$eval("#current-step", (el) => el.textContent);
      await complete.click();
      await waitIdle(page);
      assert((await page.$$eval(".msg-folded", (els) => els.length)) > 0 || (await page.$eval("#current-step", (el) => el.textContent)) !== before);
    }
    await shot(page, viewport, "g-step");
  }],
  ["h-agents", async (page, viewport, state) => {
    await page.goto(state.caseUrl, { waitUntil: "networkidle2", timeout: TIMEOUT });
    await waitIdle(page);
    const count = await page.$$eval(".agent-rail-button", (els) => els.length);
    assert(count > 0);
    for (let i = 0; i < count; i += 1) {
      await page.$$eval(".agent-rail-button", (els, index) => els[index]?.click(), i);
      assert(await page.$('.agent-card[role="dialog"]'));
      const focus = await page.$(".agent-card-go");
      if (focus) await focus.click(); else await page.click('.agent-card button[aria-label="Close"]');
    }
    await shot(page, viewport, "h-agents");
  }],
  ["i-pages", async (page, viewport, state) => {
    const id = state.caseId;
    assert(id);
    for (const route of ["/", "/procedures", "/procedures/868", "/cases", `/cases/${id}`, "/ledger", "/faq", "/entities", "/agents", "/demo/868"]) {
      const response = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2", timeout: TIMEOUT });
      assert(response && response.status() < 500, `${route} returned ${response?.status()}`);
      assert(await page.$("body"));
    }
    await shot(page, viewport, "i-pages");
  }],
  ["j-reset", async (page, viewport) => {
    await fresh(page);
    await send(page, "I want to import yoghurt from Almaty");
    const rail = await page.$(".site-rail, .nav-rail");
    if (rail) assert(await rail.evaluate((el) => el.matches('[data-collapsed="true"], .collapsed, :has(.rail-collapsed)')));
    const reset = await page.$('a[href="/?case=new"]');
    assert(reset, "New shipment link missing");
    await reset.evaluate((el) => el.click());
    await page.waitForSelector(".start-title", { timeout: TIMEOUT });
    assert.equal(await page.$$eval(".msg", (els) => els.length), 0);
    await shot(page, viewport, "j-reset");
  }],
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport(viewport);
    page.setDefaultTimeout(TIMEOUT);
    const faults = [];
    page.on("pageerror", (error) => faults.push(`pageerror: ${cleanMessage(error.message)}`));
    page.on("console", (message) => { if (message.type() === "error") faults.push(`console: ${cleanMessage(message.text())}`); });
    page.on("requestfailed", (request) => faults.push(`request: ${request.url()} (${request.failure()?.errorText})`));
    page.on("response", (response) => { if (response.status() >= 500) faults.push(`response: ${response.status()} ${response.url()}`); });
    const state = {};
    for (const [name, run] of scenarios) {
      const before = faults.length;
      try {
        await run(page, viewport.name, state);
        assert.deepEqual(faults.slice(before), [], faults.slice(before).join("\n"));
        results.push({ viewport: viewport.name, scenario: name, pass: true, detail: "Passed" });
        console.log(`PASS ${viewport.name} ${name}`);
      } catch (error) {
        await shot(page, viewport.name, `${name}-FAIL`).catch(() => {});
        results.push({ viewport: viewport.name, scenario: name, pass: false, detail: cleanMessage(error.stack ?? error) });
        console.error(`FAIL ${viewport.name} ${name}: ${cleanMessage(error.message)}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.pass)) process.exitCode = 1;
