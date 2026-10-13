#!/usr/bin/env node
/**
 * Generate the bot's Go Picadera skill from the storefront's own menu data.
 *
 * The menu is defined once, in the storefront's index.html. Copying prices
 * into a second file by hand guarantees that one day the website says $14 and
 * the bot says $12 -- so this reads the real PRODUCTS/OPTIONS tables and
 * renders them.
 *
 * Run after any menu or price change, then re-import to the gateway.
 */
const fs = require("fs");
const path = require("path");

// Walk up looking for the storefront's index.html. This file is committed to
// the console repo, where it sits one level deeper than in the dev working
// tree, and the storefront can be checked out under more than one name: its
// GitHub repo is "GoPicadera", and it was "redesign" in the original tree.
// Checking several names at each level up keeps a fixed path from silently
// producing nothing. Set GOPICADERA_STOREFRONT to an index.html to skip the
// search entirely.
const STOREFRONT_NAMES = ["GoPicadera", "redesign", "storefront", "gopicadera"];

function findStorefront(start) {
  const override = process.env.GOPICADERA_STOREFRONT;
  if (override) {
    if (fs.existsSync(override)) return override;
    throw new Error(
      "GOPICADERA_STOREFRONT is set but no file is there: " + override,
    );
  }
  let dir = start;
  for (let i = 0; i < 6; i++) {
    for (const name of STOREFRONT_NAMES) {
      const candidate = path.join(dir, name, "index.html");
      if (fs.existsSync(candidate)) return candidate;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(
    "storefront index.html not found above " + start + " (looked for " +
      STOREFRONT_NAMES.map((n) => n + "/index.html").join(", ") +
      ") -- run this from a checkout that also contains the storefront, or " +
      "set GOPICADERA_STOREFRONT to its index.html.",
  );
}

const SRC = findStorefront(__dirname);
const ROOT = path.dirname(path.dirname(SRC));
// Only the customer-facing menu skill is generated. The back-office skill
// (gopicadera-consola) is hand-written prose about roles and rules, and lives
// beside this one -- do not let this script touch it.
const OUT = path.join(__dirname, ".openclaw", "skills", "gopicadera", "SKILL.md");

const html = fs.readFileSync(SRC, "utf8");
// The menu data is one `const S="...",CATEGORIES=[...],...,OPTIONS={...}` chain,
// followed by `Object.entries(OPTIONS).forEach(...)` which hangs each option
// group off its product's `.opts`. Start at CATEGORIES (so the leading S is
// dropped and supplied as a parameter below) and run through that attachment,
// stopping before the later `Object.entries(TAGS)`. Anchoring on `CATEGORIES=[`
// rather than `const CATEGORIES` survives the storefront declaring it mid-chain
// as `,CATEGORIES=[`.
const start = html.indexOf("CATEGORIES=[");
const end = html.indexOf("Object.entries(TAGS)");
if (start < 0 || end < 0) throw new Error("menu block not found in " + SRC);

// Trim a trailing separator: the slice ends right before `Object.entries(TAGS)`,
// which the page joins to the line before it with a comma, so without this the
// evaluated block would end on a dangling comma and throw.
const block = html.slice(start, end).replace(/[\s,;]+$/, "");

// `S` is the dish-image prefix the page defines; the skill has no use for
// images, so any string will do.
const data = new Function(
  "S",
  block +
    "; return {PRODUCTS,CATEGORIES,OPTIONS,BEEF,AVOCADO,PICADERA_MEATS_LIST};",
)("assets/dishes/");

const money = (n) => (n == null ? "consultar" : "$" + Number(n).toFixed(2));

let menu = "";
for (const c of data.CATEGORIES) {
  const items = data.PRODUCTS.filter((p) => p.cat === c.slug);
  if (!items.length) continue;
  menu += `\n### ${c.es}\n\n`;
  for (const p of items) {
    menu += `- **${p.name}** — ${money(p.price)}`;
    if (p.es) menu += `\n  ${p.es}`;
    for (const g of p.opts || []) {
      if (g.qty) {
        menu += `\n  - *${g.es}* (cantidad libre, ${money(g.price)} c/u)`;
      } else if (g.pick) {
        menu += `\n  - *${g.es}*: elige ${g.pick} de: ` +
          g.choices.map((x) => x.es + (x.price ? ` (+${money(x.price)})` : "")).join(", ");
      } else {
        menu += `\n  - *${g.es}*: ` +
          g.choices.map((x) => x.es + (x.price ? ` (+${money(x.price)})` : "")).join(", ");
      }
    }
    menu += "\n";
  }
}

const template = fs.readFileSync(path.join(__dirname, "skill-template.md"), "utf8");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, template.replace("{{MENU}}", menu), "utf8");

console.log(
  `wrote ${path.relative(ROOT, OUT)} — ${data.PRODUCTS.length} dishes, ` +
    `beef +$${data.BEEF.toFixed(2)}, avocado +$${data.AVOCADO.toFixed(2)}`,
);
