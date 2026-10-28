// Prints the owner's ads guide (/guia-anuncios) to public/guia-anuncios.pdf, the
// file the WhatsApp bot shares. The page is the single source; its print styles lay
// it out as an A5 booklet with a checkbox per step.
//
// Usage, after `next build` and with out/ served locally (any static server):
//   node scripts/build-guide-pdf.mjs http://localhost:4174/guia-anuncios/
// Then build again so the new PDF ships in out/.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: node scripts/build-guide-pdf.mjs <url of /guia-anuncios/>");
  process.exit(2);
}

const browsers = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const browser = browsers.find((p) => existsSync(p));
if (!browser) {
  console.error("No Chrome or Edge found; set CHROME_PATH.");
  process.exit(1);
}

const out = resolve("public/guia-anuncios.pdf");
const r = spawnSync(browser, [
  "--headless=new",
  "--disable-gpu",
  "--no-pdf-header-footer",
  `--print-to-pdf=${out}`,
  url,
], { stdio: "inherit", timeout: 60_000 });

if (r.status !== 0 || !existsSync(out)) {
  console.error("Printing failed.");
  process.exit(1);
}
console.log(`wrote ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
