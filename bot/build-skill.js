#!/usr/bin/env node
/**
 * Generate the bot's Go Picadera skill from the storefront's own menu data.
 *
 * The menu is defined once, in redesign/index.html. Copying prices into a
 * second file by hand guarantees that one day the website says $14 and the bot
 * says $12 -- so this reads the real PRODUCTS/OPTIONS tables and renders them.
 *
 * Run after any menu or price change, then re-import to the gateway.
 */
const fs = require("fs");
const path = require("path");

// Walk up looking for the storefront. This file is committed to the console
// repo, where it sits one level deeper than in the working tree -- a fixed
// "../redesign" breaks silently in one of the two and produces nothing.
function findStorefront(start) {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "redesign", "index.html");
    if (fs.existsSync(candidate)) return candidate;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(
    "redesign/index.html not found above " + start +
      " -- run this from a checkout that contains the storefront.",
  );
}

const SRC = findStorefront(__dirname);
const ROOT = path.dirname(path.dirname(SRC));
// Only the customer-facing menu skill is generated. The back-office skill
// (gopicadera-consola) is hand-written prose about roles and rules, and lives
// beside this one -- do not let this script touch it.
const OUT = path.join(__dirname, ".openclaw", "skills", "gopicadera", "SKILL.md");

const html = fs.readFileSync(SRC, "utf8");
const start = html.indexOf("const CATEGORIES");
const end = html.indexOf("Object.entries(TAGS)");
if (start < 0 || end < 0) throw new Error("menu block not found in redesign/index.html");

// `S` is the dish-image prefix the page defines; the skill has no use for
// images, so any string will do.
const data = new Function(
  "S",
  html.slice(start, end) +
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
