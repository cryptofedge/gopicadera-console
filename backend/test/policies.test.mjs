// Runs the repo's SQL in PGlite (Postgres compiled to WebAssembly) with a small stand-in for
// Supabase's roles and auth.uid(), then plays anon, staff, owner and service_role requests against
// the Row Level Security policies and guards. `npm run test:sql`.
//
// This is the only place the policies are executed before they reach the live project, so a check
// here is the cheapest proof that a staff session really cannot do what the UI merely hides.
import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("..", import.meta.url));
// Windows checkouts may have CRLF line endings; the splits below look for "\n".
const sql = (f) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n");
const db = new PGlite();

const OWNER = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";
const DEACT = "44444444-4444-4444-4444-444444444444";

process.on("unhandledRejection", (e) => { console.log("LOAD ERROR:", e.message, e.where ?? ""); process.exit(2); });

// ---- Supabase stand-in ------------------------------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  -- As on Supabase: the roles hold table privileges on storage.objects, and RLS decides per row.
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
// PGlite has no uuid-ossp; the built-in generator is equivalent here.
await db.exec(`create function uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;`);

// Stand-in for whatsapp_orders.sql + place_order.sql while they live only on the
// add-order-flow-and-elmini-media branch. Same shape: a GP-#### code trigger and two
// SECURITY DEFINER doors. Once those files are on this branch, they are loaded instead.
const ORDER_FLOW_STANDIN = `
  create sequence if not exists order_code_seq start 1000;
  create or replace function assign_order_code() returns trigger language plpgsql as $$
  begin
    if new.code is null or new.code = '' then new.code := 'GP-' || nextval('order_code_seq')::text; end if;
    return new;
  end $$;
  create trigger trg_assign_order_code before insert on orders for each row execute function assign_order_code();
  create or replace function get_order_by_code(p_code text, p_phone text) returns jsonb
    language plpgsql security definer set search_path = public as $$
  declare result jsonb;
  begin
    select jsonb_build_object('code', o.code, 'payment', o.payment,
             'items', coalesce((select jsonb_agg(jsonb_build_object('name', oi.name, 'qty', oi.qty)) from order_items oi where oi.order_id = o.id), '[]'::jsonb))
      into result from orders o where o.code = p_code and o.phone = p_phone;
    return result;
  end $$;
  create or replace function place_order(p_source order_source, p_customer_name text, p_phone text, p_mode order_mode,
      p_subtotal numeric, p_tax numeric, p_total numeric, p_loyalty_code text, p_note text, p_items jsonb)
    returns text language plpgsql security definer set search_path = public as $$
  declare v_id uuid; v_code text; v_item jsonb;
  begin
    insert into orders (source, customer_name, phone, mode, subtotal, tax, total, loyalty_code, note)
    values (p_source, p_customer_name, p_phone, p_mode, p_subtotal, p_tax, p_total, p_loyalty_code, p_note)
    returning id, code into v_id, v_code;
    for v_item in select * from jsonb_array_elements(p_items) loop
      insert into order_items (order_id, name, qty, unit_price, options)
      values (v_id, v_item->>'name', coalesce((v_item->>'qty')::int, 1), (v_item->>'unit_price')::numeric, coalesce(v_item->'options', '[]'::jsonb));
    end loop;
    return v_code;
  end $$;
`;

// ---- repo SQL, in apply order (backend/SETUP.md) ------------------------------------------------
await db.exec(sql("schema.sql").replace(`create extension if not exists "uuid-ossp";`, ""));
{
  // integrations.sql adds enum values and uses them in the same file; Postgres refuses that inside
  // one transaction, so the enum additions run on their own.
  const src = sql("integrations.sql");
  const cut = src.indexOf("alter type integration_kind add value 'ads';");
  const after = src.indexOf("insert into integrations (provider, kind) values\n  ('google_ads'");
  await db.exec(src.slice(0, cut));
  for (const stmt of src.slice(cut, after).split(";").map((s) => s.trim()).filter(Boolean)) await db.exec(stmt);
  await db.exec(src.slice(after));
}
if (existsSync(join(dir, "whatsapp_orders.sql")) && existsSync(join(dir, "place_order.sql"))) {
  await db.exec(sql("whatsapp_orders.sql"));
  await db.exec(sql("place_order.sql"));
} else {
  await db.exec(ORDER_FLOW_STANDIN);
}
await db.exec(sql("seed_menu.sql"));
await db.exec(sql("first_login.sql"));
await db.exec(sql("stripe_payments.sql"));
await db.exec(sql("ads_oauth.sql"));
await db.exec(sql("security_hardening.sql"));
await db.exec(sql("ads_sync.sql"));
await db.exec(sql("ads_create.sql"));
await db.exec(sql("ads_accounts.sql"));
// All five are documented as safe to run more than once.
await db.exec(sql("ads_oauth.sql"));
await db.exec(sql("security_hardening.sql"));
await db.exec(sql("ads_sync.sql"));
await db.exec(sql("ads_create.sql"));
await db.exec(sql("ads_accounts.sql"));

await db.exec(`
  insert into auth.users values ('${OWNER}', 'o@x'), ('${STAFF}', 's@x'), ('${STRANGER}', 'x@x'), ('${DEACT}', 'd@x');
  insert into profiles (id, full_name, role, active) values
    ('${OWNER}', 'Dueno', 'owner', true), ('${STAFF}', 'Yudelka', 'staff', true), ('${DEACT}', 'Ex', 'staff', false);
`);

// ---- harness ------------------------------------------------------------------------------------
let pass = 0, fail = 0;
async function as(role, uid, q, params) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try { return await db.query(q, params); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function expectOk(label, role, uid, q, params) {
  try { const r = await as(role, uid, q, params); pass++; console.log("  ok    ", label); return r; }
  catch (e) { fail++; console.log("  FAIL  ", label, "->", e.message); }
}
async function expectErr(label, role, uid, q, params) {
  try { await as(role, uid, q, params); fail++; console.log("  FAIL  ", label, "-> succeeded, expected an error"); }
  catch (e) { pass++; console.log("  ok    ", label, `(${e.message.slice(0, 70)})`); }
}
function check(label, cond, detail) {
  if (cond) { pass++; console.log("  ok    ", label); }
  else { fail++; console.log("  FAIL  ", label, detail ?? ""); }
}
const row = async (q) => (await db.query(q)).rows[0];
const firstPricedSlug = async () => (await row(`select slug from products where price is not null and available order by sort limit 1`)).slug;

// ---- 1. anonymous order inserts -------------------------------------------------------------------
console.log("\nanon inserts");
await expectOk("anon inserts a web order claiming paid/done/verified", "anon", null,
  `insert into orders (id, code, source, subtotal, total, payment, status, price_verified, external_id, taken_by_name, paid_at)
   values ('aaaaaaaa-0000-0000-0000-000000000001', 'FAKE-1', 'web', 0.01, 0.01, 'paid', 'done', true, 'dd-123', 'Richard', now())`);
let o = await row(`select * from orders where code = 'FAKE-1'`);
check("  ...stored as new / unpaid / unverified", o.status === "new" && o.payment === "unpaid" && o.price_verified === false, JSON.stringify(o));
check("  ...external_id, paid_at and taken_by_name reset", o.external_id === null && o.paid_at === null && o.taken_by_name === null);
await expectOk("anon adds a line to its own fresh order", "anon", null,
  `insert into order_items (order_id, name, qty, unit_price) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Chimi', 1, 0.01)`);
try { await as("service_role", null, `select begin_card_checkout('FAKE-1')`); check("begin_card_checkout refuses it as unverified", false, "succeeded"); }
catch (e) { check("begin_card_checkout refuses it as unverified", /not priced by the server/.test(e.message), e.message); }
await expectErr("signed-in user with no profile cannot insert (stamp_taker FK)", "authenticated", STRANGER,
  `insert into orders (code, total) values ('FAKE-X', 1)`);
await expectOk("deactivated staff gets the same reset as anon", "authenticated", DEACT,
  `insert into orders (code, total, payment) values ('FAKE-2', 1, 'paid')`);
check("  ...stored unpaid", (await row(`select payment from orders where code = 'FAKE-2'`))?.payment === "unpaid");

console.log("\nstorefront RPCs");
const card = await expectOk("anon place_card_order", "anon", null,
  `select place_card_order('Ana', '5551234', 'pickup', null, null, $1::jsonb) as r`,
  [JSON.stringify([{ slug: await firstPricedSlug(), qty: 2 }])]);
o = await row(`select * from orders where code = '${card?.rows[0].r.code}'`);
check("  ...card order keeps price_verified", o?.price_verified === true, JSON.stringify(o));
check("  ...card order has its lines", Number((await row(`select count(*) n from order_items where order_id = '${o?.id}'`)).n) === 1);
await expectErr("anon cannot add a line to the card order", "anon", null,
  `insert into order_items (order_id, name, qty, unit_price) values ('${o?.id}', 'Extra', 9, 0)`);
const po = await expectOk("storefront place_order still works for anon", "anon", null,
  `select place_order('web', null, '5550000', 'pickup', 12.5, 0, 12.5, null, null, '[{"name":"Yaroa","qty":1,"unit_price":12.5}]'::jsonb) as code`);
check("  ...code assigned by trg_assign_order_code", /^GP-\d+$/.test(po?.rows[0].code ?? ""), po?.rows[0].code);
await expectOk("bot-style direct insert: order with its own id and no code", "anon", null,
  `insert into orders (id, source, phone, total) values ('bbbbbbbb-0000-0000-0000-000000000001', 'whatsapp', '5551111', 8)`);
await expectOk("  ...then its lines", "anon", null,
  `insert into order_items (order_id, name, qty, unit_price) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Empanada', 2, 4)`);
const botCode = (await row(`select code from orders where id = 'bbbbbbbb-0000-0000-0000-000000000001'`)).code;
check("  ...got a GP code", /^GP-\d+$/.test(botCode));
const back = await expectOk("get_order_by_code reads it back with code + phone", "anon", null,
  `select get_order_by_code('${botCode}', '5551111') as o`);
check("  ...unpaid, with its 2 empanadas", back?.rows[0].o?.payment === "unpaid" && back?.rows[0].o?.items?.[0]?.qty === 2, JSON.stringify(back?.rows[0].o));
await db.exec(`update orders set created_at = now() - interval '1 hour' where code = 'FAKE-2'`);
await expectErr("anon cannot add a line to an hour-old order", "anon", null,
  `insert into order_items (order_id, name, qty, unit_price) values ('${(await row(`select id from orders where code = 'FAKE-2'`)).id}', 'Late', 1, 0)`);
await db.exec(`update orders set payment = 'paid' where code = 'FAKE-1'`);
await expectErr("anon cannot add a line to a paid order", "anon", null,
  `insert into order_items (order_id, name, qty, unit_price) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Free', 5, 0)`);

// ---- 2. staff updates -------------------------------------------------------------------------------
console.log("\nstaff updates");
const B = `'${o?.id}'`;
await expectOk("staff moves new -> cooking", "authenticated", STAFF, `update orders set status = 'cooking' where id = ${B}`);
check("  ...handler stamped by the server", (await row(`select handled_by_name from orders where id = ${B}`)).handled_by_name === "Yudelka");
await expectErr("staff cannot change the total", "authenticated", STAFF, `update orders set total = 0.01 where id = ${B}`);
await expectErr("staff cannot mark it paid", "authenticated", STAFF, `update orders set payment = 'paid' where id = ${B}`);
await expectErr("staff cannot sneak a total in with a status change", "authenticated", STAFF, `update orders set status = 'ready', total = 1 where id = ${B}`);
await expectErr("staff cannot set handled_by_name themselves", "authenticated", STAFF, `update orders set handled_by_name = 'Richard' where id = ${B}`);
await expectOk("staff moves cooking -> ready", "authenticated", STAFF, `update orders set status = 'ready' where id = ${B}`);
await expectOk("staff moves ready -> done", "authenticated", STAFF, `update orders set status = 'done' where id = ${B}`);
check("  ...done_at set by deplete_on_done", (await row(`select done_at from orders where id = ${B}`)).done_at !== null);
await expectErr("staff cannot reopen a done order", "authenticated", STAFF, `update orders set status = 'cooking' where id = ${B}`);
await expectOk("owner can change a total", "authenticated", OWNER, `update orders set total = 99 where id = ${B}`);
await expectOk("owner can reopen", "authenticated", OWNER, `update orders set status = 'ready' where id = ${B}`);

console.log("\nserver paths");
const fresh = await expectOk("anon places another card order", "anon", null,
  `select place_card_order(null, null, 'pickup', null, null, $1::jsonb) as r`,
  [JSON.stringify([{ slug: await firstPricedSlug(), qty: 1 }])]);
const f = await row(`select * from orders where code = '${fresh?.rows[0].r.code}'`);
await expectOk("service_role begin_card_checkout", "service_role", null, `select begin_card_checkout('${f.code}')`);
const ev = await expectOk("service_role apply_stripe_event marks it paid", "service_role", null,
  `select apply_stripe_event('evt_1', 'checkout.session.completed', $1::jsonb) as r`,
  [JSON.stringify({ id: "cs_1", client_reference_id: f.code, payment_status: "paid", amount_total: Math.round(Number(f.total) * 100), currency: "usd", payment_intent: "pi_1" })]);
check("  ...outcome paid", ev?.rows[0].r === "paid", ev?.rows[0].r);

// ---- 3. loyalty codes --------------------------------------------------------------------------------
console.log("\nloyalty codes");
await db.exec(`insert into loyalty_cards (id, phone) values ('cccccccc-0000-0000-0000-000000000001', '555');
               insert into loyalty_codes (code, card_id) values ('GP-A', 'cccccccc-0000-0000-0000-000000000001'), ('GP-B', 'cccccccc-0000-0000-0000-000000000001')`);
await expectOk("staff spends a code directly", "authenticated", STAFF, `update loyalty_codes set redeemed_at = '2000-01-01' where code = 'GP-A'`);
const lc = await row(`select * from loyalty_codes where code = 'GP-A'`);
check("  ...time and person come from the server", new Date(lc.redeemed_at).getFullYear() > 2000 && lc.redeemed_by === STAFF, JSON.stringify(lc));
await expectErr("staff cannot un-spend it", "authenticated", STAFF, `update loyalty_codes set redeemed_at = null where code = 'GP-A'`);
await expectErr("staff cannot move a code to another card", "authenticated", STAFF, `update loyalty_codes set card_id = null where code = 'GP-B'`);
await expectOk("staff redeem_code() still works", "authenticated", STAFF, `select redeem_code('GP-B')`);
await expectOk("owner can un-spend", "authenticated", OWNER, `update loyalty_codes set redeemed_at = null where code = 'GP-A'`);

// ---- 4. integrations ---------------------------------------------------------------------------------
console.log("\nintegrations");
// A token stored by the old ads_oauth.sql (in client_id), then the new file re-run over it.
await db.exec(`update integrations set client_id = 'old-refresh', refresh_token = null, client_secret = 'old-access', status = 'connected' where provider = 'tiktok_ads'`);
await db.exec(sql("ads_oauth.sql"));
let t = await row(`select client_id, refresh_token from integrations where provider = 'tiktok_ads'`);
check("re-running ads_oauth.sql moves the old token out of client_id", t.client_id === null && t.refresh_token === "old-refresh", JSON.stringify(t));
check("there is exactly one apply_oauth_connection (no ambiguous overloads)",
  Number((await row(`select count(*) n from pg_proc where proname = 'apply_oauth_connection'`)).n) === 1);
await expectErr("the browser cannot call apply_oauth_connection", "authenticated", OWNER,
  `select apply_oauth_connection('meta_ads', 'x', 'x')`);
await expectOk("service_role connects TikTok the way the callback does (no refresh token, no details)", "service_role", null,
  `select apply_oauth_connection(p_provider => 'tiktok_ads', p_access_token => 'acc-1', p_account_id => 'adv-1', p_refresh_token => null)`);
t = await row(`select client_id, refresh_token, client_secret, has_secret, details from integrations where provider = 'tiktok_ads'`);
check("  ...token saved, no refresh token, empty details, has_secret true",
  t.client_id === null && t.refresh_token === null && t.client_secret === "acc-1" && t.has_secret === true && JSON.stringify(t.details) === "{}", JSON.stringify(t));
const metaDetails = { pages: [{ id: "page-1", name: "Go Picadera", instagram: { id: "ig-1", username: "gopicadera" } }], token_expires_at: "2026-12-27T12:00:00.000Z" };
await expectOk("service_role connects Meta with its Page, Instagram and expiry", "service_role", null,
  `select apply_oauth_connection(p_provider => 'meta_ads', p_access_token => 'meta-tok', p_account_id => '111,222', p_details => $1::jsonb)`,
  [JSON.stringify(metaDetails)]);
check("  ...and chooses no ad account: store_id stays empty until an owner picks one",
  (await row(`select store_id from integrations where provider = 'meta_ads'`)).store_id === null);
const page = await expectOk("owner runs the Canales page query, details included", "authenticated", OWNER,
  `select provider, kind, status, store_id, client_id, has_secret, details, last_order_at, last_error, auto_accept from integrations order by provider`);
check("  ...and sees every row", page?.rows.length === 11, page?.rows.length);
check("  ...with Meta's Page and Instagram, but no token", (() => {
  const m = page?.rows.find((r) => r.provider === "meta_ads");
  return m?.details?.pages?.[0]?.instagram?.username === "gopicadera" && !JSON.stringify(m).includes("meta-tok");
})());
await expectErr("owner cannot read client_secret", "authenticated", OWNER, `select client_secret from integrations`);
await expectErr("owner cannot read refresh_token", "authenticated", OWNER, `select refresh_token from integrations`);
await expectErr("owner cannot select *", "authenticated", OWNER, `select * from integrations`);
const staffPage = await expectOk("staff runs the same query without an error", "authenticated", STAFF,
  `select provider, has_secret, details from integrations`);
check("  ...and gets no rows", staffPage?.rows.length === 0);
await expectOk("owner saves a pasted key", "authenticated", OWNER,
  `update integrations set store_id = 's1', client_id = 'c1', client_secret = 'k1', status = 'pending' where provider = 'ubereats'`);
check("  ...has_secret true", (await row(`select has_secret from integrations where provider = 'ubereats'`)).has_secret === true);
await db.exec(`update integrations set refresh_token = 'tt-refresh' where provider = 'tiktok_ads'`);
await expectOk("owner disconnects TikTok the way the console does", "authenticated", OWNER,
  `update integrations set status = 'disconnected', client_secret = null where provider = 'tiktok_ads'`);
t = await row(`select refresh_token, client_secret, has_secret from integrations where provider = 'tiktok_ads'`);
check("  ...refresh token cleared too", t.refresh_token === null && t.client_secret === null && t.has_secret === false, JSON.stringify(t));
await expectOk("owner disconnects Meta", "authenticated", OWNER,
  `update integrations set status = 'disconnected', client_secret = null where provider = 'meta_ads'`);
check("  ...its Page/expiry details are cleared",
  JSON.stringify((await row(`select details from integrations where provider = 'meta_ads'`)).details) === "{}");

// ---- 5. campaigns and the ads worker's queue (ads_sync.sql) ------------------------------------------
console.log("\nads worker queue");
const jobsFor = async (id) => (await db.query(`select action::text, done_at, claimed_at, attempts, last_error from campaign_jobs where campaign_id = $1 order by created_at`, [id])).rows;
await db.exec(`
  insert into campaigns (id, provider, name, status, external_id, platform_ids, account_id)
    values ('dddddddd-0000-0000-0000-000000000001', 'meta_ads', 'Mofongo', 'active', 'c1', '{"campaign":"c1"}', '111');
  insert into campaigns (id, provider, name, status)
    values ('dddddddd-0000-0000-0000-000000000002', 'meta_ads', 'Borrador', 'draft');`);
const LIVE = "dddddddd-0000-0000-0000-000000000001";
const DRAFT = "dddddddd-0000-0000-0000-000000000002";
await expectOk("owner pauses a live campaign", "authenticated", OWNER, `update campaigns set status = 'paused' where id = '${LIVE}'`);
check("  ...a pause job is queued", (await jobsFor(LIVE)).map((j) => j.action).join() === "pause");
// RLS does not raise for a row the caller may not update; the update simply matches nothing.
const staffTry = await expectOk("staff tries to turn it back on", "authenticated", STAFF,
  `update campaigns set status = 'active' where id = '${LIVE}' returning id`);
check("  ...nothing changes and nothing is queued",
  staffTry?.rows.length === 0 && (await row(`select status::text s from campaigns where id = '${LIVE}'`)).s === "paused" && (await jobsFor(LIVE)).length === 1);
await expectErr("the browser cannot claim jobs", "authenticated", OWNER, `select claim_campaign_jobs(10)`);
await expectErr("the browser cannot finish jobs", "authenticated", OWNER, `select finish_campaign_job(gen_random_uuid(), true)`);
await expectErr("the browser cannot write platform campaigns", "authenticated", OWNER, `select upsert_platform_campaigns('meta_ads', '[]')`);
await expectErr("the browser cannot set connection health", "authenticated", OWNER, `select set_integration_health('meta_ads')`);
const claim1 = await expectOk("service_role claims the job", "service_role", null, `select claim_campaign_jobs(10) as j`);
const job1 = claim1?.rows[0].j?.[0];
check("  ...with its campaign attached", job1?.action === "pause" && job1?.campaign?.platform_ids?.campaign === "c1" && job1?.attempts === 1, JSON.stringify(job1));
const claim2 = await as("service_role", null, `select claim_campaign_jobs(10) as j`);
check("  ...and a second run does not take it again", claim2.rows[0].j.length === 0, JSON.stringify(claim2.rows[0].j));
await expectOk("worker finishes it, writing the platform's status back", "service_role", null,
  `select finish_campaign_job($1::uuid, true, null, '{"status":"paused","platform_status":"PAUSED"}'::jsonb)`, [job1?.job_id]);
check("  ...the job is done and no new job was queued by the worker's own write",
  (await jobsFor(LIVE)).length === 1 && (await jobsFor(LIVE))[0].done_at !== null);
await expectOk("owner turns it back on", "authenticated", OWNER, `update campaigns set status = 'active' where id = '${LIVE}'`);
check("  ...queues a resume, not a second launch", (await jobsFor(LIVE)).map((j) => j.action).join() === "pause,resume");
const resumeJob = (await as("service_role", null, `select claim_campaign_jobs(10) as j`)).rows[0].j[0];
await expectOk("a rate-limited attempt is left open for the next run", "service_role", null,
  `select finish_campaign_job($1::uuid, false, 'Too many requests', null, true)`, [resumeJob.job_id]);
let rj = (await jobsFor(LIVE))[1];
check("  ...not done, not claimed, error kept", rj.done_at === null && rj.claimed_at === null && rj.last_error === "Too many requests", JSON.stringify(rj));
await db.exec(`update campaign_jobs set attempts = 5 where campaign_id = '${LIVE}' and action = 'resume'`);
await expectOk("after five attempts it gives up", "service_role", null,
  `select finish_campaign_job($1::uuid, false, 'Still limited', null, true)`, [resumeJob.job_id]);
rj = (await jobsFor(LIVE))[1];
check("  ...done, with the reason on the campaign",
  rj.done_at !== null && (await row(`select last_error from campaigns where id = '${LIVE}'`)).last_error === "Still limited");
await expectOk("owner publishes a draft", "authenticated", OWNER, `update campaigns set status = 'publishing' where id = '${DRAFT}'`);
check("  ...queues a launch", (await jobsFor(DRAFT)).map((j) => j.action).join() === "launch");
const launchJob = (await as("service_role", null, `select claim_campaign_jobs(10) as j`)).rows[0].j[0];
await expectOk("a refused launch", "service_role", null,
  `select finish_campaign_job($1::uuid, false, 'No disponible', null, false)`, [launchJob.job_id]);
check("  ...marks the campaign failed with the reason",
  JSON.stringify(await row(`select status::text, last_error from campaigns where id = '${DRAFT}'`)) === JSON.stringify({ status: "failed", last_error: "No disponible" }));
check("  ...without queueing anything new", (await jobsFor(DRAFT)).length === 1);

console.log("\nplatform sync");
const metaRows = [
  { campaign_id: "c1", account_id: "111", name: "Renamed on Meta", status: "paused", platform_status: "PAUSED", daily_budget: 15, spend: 42.17, impressions: 9000, clicks: 250, orders: 7, starts_at: null, ends_at: null },
  { campaign_id: "c9", account_id: "111", name: "Made in Ads Manager", status: "active", platform_status: "ACTIVE", daily_budget: 10, spend: 5, impressions: 100, clicks: 3, orders: 0, starts_at: "2026-10-01T04:00:00Z", ends_at: null },
];
const up1 = await expectOk("worker records what Meta reports", "service_role", null,
  `select upsert_platform_campaigns('meta_ads', $1::jsonb) as n`, [JSON.stringify(metaRows)]);
check("  ...two rows handled", up1?.rows[0].n === 2);
const live = await row(`select name, status::text, spend, impressions, orders, platform_status, synced_at from campaigns where id = '${LIVE}'`);
check("  ...a campaign made here keeps its own name but takes Meta's numbers and state",
  live.name === "Mofongo" && live.status === "paused" && Number(live.spend) === 42.17 && live.impressions === 9000 && live.orders === 7 && live.synced_at !== null, JSON.stringify(live));
const imported = await row(`select name, status::text, origin, external_id, platform_ids, account_id from campaigns where platform_ids->>'campaign' = 'c9'`);
check("  ...one made in Ads Manager is added, marked as coming from the platform",
  imported?.origin === "platform" && imported.name === "Made in Ads Manager" && imported.external_id === "c9" && imported.account_id === "111", JSON.stringify(imported));
await expectOk("the same report again", "service_role", null, `select upsert_platform_campaigns('meta_ads', $1::jsonb)`, [JSON.stringify(metaRows)]);
check("  ...updates instead of duplicating", Number((await row(`select count(*) n from campaigns where platform_ids ? 'campaign'`)).n) === 2);
await db.exec(`update campaigns set status = 'publishing' where platform_ids->>'campaign' = 'c9'`);
await expectOk("a sync during a launch", "service_role", null, `select upsert_platform_campaigns('meta_ads', $1::jsonb)`, [JSON.stringify(metaRows)]);
check("  ...does not paper over 'publishing'", (await row(`select status::text s from campaigns where platform_ids->>'campaign' = 'c9'`)).s === "publishing");
const staffView = await expectOk("staff can still see campaigns and their numbers", "authenticated", STAFF, `select name, spend from campaigns`);
check("  ...all of them", staffView?.rows.length === 3);

console.log("\nconnection health");
await db.exec(`update integrations set status = 'connected', details = '{"pages":[{"id":"p1"}]}' where provider = 'meta_ads'`);
await expectOk("worker warns that the Meta token is close to expiry", "service_role", null,
  `select set_integration_health('meta_ads', null, 'Reconecta Meta antes del 02/11', '{"checked_at":"2026-10-28"}')`);
let mh = await row(`select status::text, last_error, details from integrations where provider = 'meta_ads'`);
check("  ...status kept, warning set, details merged not replaced",
  mh.status === "connected" && mh.last_error.startsWith("Reconecta") && mh.details.pages?.[0]?.id === "p1" && mh.details.checked_at === "2026-10-28", JSON.stringify(mh));
await expectOk("a later good sync clears the warning", "service_role", null, `select set_integration_health('meta_ads', 'connected', null)`);
mh = await row(`select status::text, last_error from integrations where provider = 'meta_ads'`);
check("  ...cleared", mh.status === "connected" && mh.last_error === null);
await expectOk("health never resurrects a disconnected platform", "service_role", null, `select set_integration_health('tiktok_ads', 'error', 'x')`);
check("  ...TikTok stays disconnected", (await row(`select status::text s from integrations where provider = 'tiktok_ads'`)).s === "disconnected");

console.log("\ncreating ads (ads_create.sql)");
await expectOk("owner uploads an ad image", "authenticated", OWNER,
  `insert into storage.objects (bucket_id, name) values ('ads', 'meta/1.jpg')`);
await expectErr("staff cannot upload ad media", "authenticated", STAFF,
  `insert into storage.objects (bucket_id, name) values ('ads', 'meta/2.jpg')`);
await expectErr("a visitor cannot upload ad media", "anon", null,
  `insert into storage.objects (bucket_id, name) values ('ads', 'meta/3.jpg')`);
const seen = await expectOk("anyone can read it (the platforms fetch it by URL)", "anon", null,
  `select name from storage.objects where bucket_id = 'ads'`);
check("  ...one image, the owner's", seen?.rows.length === 1 && seen.rows[0].name === "meta/1.jpg");
const tgt = (await row(`select value from settings where key = 'ads_targeting'`))?.value;
check("default targeting: the restaurant's coordinates, 3 miles, gopicadera.com",
  Math.abs(tgt?.lat - 40.6473819) < 1e-6 && Math.abs(tgt?.lng + 74.0121613) < 1e-6 && tgt?.radius_mi === 3 && tgt?.destination_url === "https://gopicadera.com", JSON.stringify(tgt));
await db.exec(`update settings set value = jsonb_set(value, '{radius_mi}', '5') where key = 'ads_targeting'`);
await db.exec(sql("ads_create.sql"));
check("  ...and re-running the file keeps what the owner changed", (await row(`select value->>'radius_mi' r from settings where key = 'ads_targeting'`)).r === "5");
await expectOk("owner saves a draft with everything a launch needs", "authenticated", OWNER,
  `insert into campaigns (provider, name, headline, body, daily_budget, destination_url, media_url, radius_mi, google_assets, starts_at, ends_at)
   values ('google_ads', 'Busqueda', 'h', 'b', 10, 'https://gopicadera.com', null, 3,
           '{"headlines":["a","b","c"],"descriptions":["d","e"],"keywords":["k"]}', now(), now() + interval '7 days')`);

// ---- 6. the owner's own developer apps (ads_accounts.sql) --------------------------------------------
console.log("\nad apps (ads_accounts.sql)");
const appRow = async (p) => row(`select app_id, app_secret, login_config_id, has_secret, updated_by from ads_apps where provider = '${p}'`);
await expectOk("owner saves the Meta app (id, secret, configuration)", "authenticated", OWNER,
  `select set_ads_app('meta_ads', ' 1234567890 ', 'meta-app-secret', '555')`);
let app = await appRow("meta_ads");
check("  ...id trimmed, secret stored, configuration kept, and who saved it",
  app.app_id === "1234567890" && app.app_secret === "meta-app-secret" && app.login_config_id === "555" && app.has_secret === true && app.updated_by === OWNER, JSON.stringify(app));
await expectErr("staff cannot save an app", "authenticated", STAFF, `select set_ads_app('meta_ads', '1', 'x')`);
await expectErr("a visitor cannot save an app", "anon", null, `select set_ads_app('meta_ads', '1', 'x')`);
await expectErr("the browser cannot write ads_apps directly", "authenticated", OWNER, `update ads_apps set app_id = '9' where provider = 'meta_ads'`);
check("  ...the app is unchanged", (await appRow("meta_ads")).app_id === "1234567890");
await expectErr("owner cannot read app_secret", "authenticated", OWNER, `select app_secret from ads_apps`);
await expectErr("owner cannot select * from ads_apps", "authenticated", OWNER, `select * from ads_apps`);
const apps = await expectOk("owner reads what Canales shows", "authenticated", OWNER,
  `select provider, app_id, login_config_id, has_secret, updated_at from ads_apps order by provider`);
check("  ...three apps, Meta's saved with a secret and no secret in sight",
  apps?.rows.length === 3 && apps.rows.find((r) => r.provider === "meta_ads")?.has_secret === true && !JSON.stringify(apps.rows).includes("meta-app-secret"));
const staffApps = await expectOk("staff reads ads_apps without an error", "authenticated", STAFF, `select provider, has_secret from ads_apps`);
check("  ...and gets no rows", staffApps?.rows.length === 0);
await expectErr("a visitor cannot read ads_apps", "anon", null, `select provider from ads_apps`);
await expectOk("owner clears the configuration id and leaves the secret blank", "authenticated", OWNER,
  `select set_ads_app('meta_ads', '1234567890', '', null)`);
app = await appRow("meta_ads");
check("  ...the stored secret is kept", app.app_secret === "meta-app-secret" && app.login_config_id === null, JSON.stringify(app));
await expectOk("owner saves again with no secret argument at all", "authenticated", OWNER, `select set_ads_app('meta_ads', '1234567890')`);
check("  ...still kept", (await appRow("meta_ads")).app_secret === "meta-app-secret");
await expectErr("a Meta app id with letters is refused", "authenticated", OWNER, `select set_ads_app('meta_ads', 'abc123', 'x')`);
await expectErr("a TikTok app id with letters is refused", "authenticated", OWNER, `select set_ads_app('tiktok_ads', '72a9', 'x')`);
await expectErr("a Google client id not ending in .apps.googleusercontent.com is refused", "authenticated", OWNER,
  `select set_ads_app('google_ads', '1234-abc', 'x')`);
await expectErr("a blank app id is refused", "authenticated", OWNER, `select set_ads_app('tiktok_ads', '   ', 'x')`);
await expectErr("a Meta configuration id with letters is refused", "authenticated", OWNER, `select set_ads_app('meta_ads', '1234567890', null, 'cfg-1')`);
await expectErr("a delivery channel has no ad app", "authenticated", OWNER, `select set_ads_app('ubereats', '1', 'x')`);
check("  ...none of the refused saves changed anything",
  (await appRow("meta_ads")).app_id === "1234567890" && (await appRow("tiktok_ads")).app_id === null && (await appRow("google_ads")).app_id === null);
await expectOk("owner saves the Google client", "authenticated", OWNER,
  `select set_ads_app('google_ads', ' 1234-abc.apps.googleusercontent.com ', 'g-secret', '999')`);
app = await appRow("google_ads");
check("  ...configuration id is Meta-only", app.app_id === "1234-abc.apps.googleusercontent.com" && app.has_secret && app.login_config_id === null, JSON.stringify(app));
await db.exec(`update integrations set status = 'connected', client_secret = 'tok-old-app', refresh_token = null, store_id = '111',
                 details = '{"chosen_at":"2026-10-28T12:00:00Z","pages":[{"id":"p1"}]}' where provider = 'meta_ads'`);
await expectOk("owner saves the same Meta app id again", "authenticated", OWNER, `select set_ads_app('meta_ads', '1234567890', 'rotated-secret')`);
let mi = await row(`select status::text, has_secret, store_id, details from integrations where provider = 'meta_ads'`);
check("  ...the connection is untouched", mi.status === "connected" && mi.has_secret === true && mi.store_id === "111", JSON.stringify(mi));
await expectOk("owner switches to a different Meta app", "authenticated", OWNER, `select set_ads_app('meta_ads', '2222222222', 'other-secret')`);
mi = await row(`select status::text, has_secret, store_id, details from integrations where provider = 'meta_ads'`);
check("  ...Meta is disconnected: the old app's token, chosen account and details are gone",
  mi.status === "disconnected" && mi.has_secret === false && mi.store_id === null && JSON.stringify(mi.details) === "{}", JSON.stringify(mi));

// ---- 7. choosing Go Picadera's ad account and Page (ads_accounts.sql) ---------------------------------
console.log("\nchoosing the ad account (ads_accounts.sql)");
const META_LISTS = {
  ad_accounts: [{ id: "111", name: "Go Picadera" }, { id: "222", name: "Cuenta de Fellito" }, { id: "333", name: null }],
  pages: [{ id: "page-1", name: "Go Picadera", instagram: { id: "ig-1", username: "gopicadera" } }, { id: "page-2", name: "Otra", instagram: null }],
  token_expires_at: "2026-12-27T12:00:00.000Z",
};
const connectMeta = (label, ids, details) => expectOk(label, "service_role", null,
  `select apply_oauth_connection(p_provider => 'meta_ads', p_access_token => 'meta-tok-2', p_account_id => $1, p_details => $2::jsonb)`,
  [ids, JSON.stringify(details)]);
const metaRow = () => row(`select store_id, details, updated_by from integrations where provider = 'meta_ads'`);
await connectMeta("Meta connects with a login that reaches one account and one Page",
  "111", { ad_accounts: [META_LISTS.ad_accounts[0]], pages: [META_LISTS.pages[0]] });
let mc = await metaRow();
check("  ...even then nothing is chosen for the owner", mc.store_id === null && !mc.details.page_id && !mc.details.chosen_at, JSON.stringify(mc));
await connectMeta("Meta connects with three accounts and two Pages", "111,222,333", META_LISTS);
mc = await metaRow();
check("  ...the accounts and Pages are recorded with their names, none chosen",
  mc.store_id === null && mc.details.ad_accounts.length === 3 && mc.details.ad_accounts[0].name === "Go Picadera" && mc.details.pages.length === 2, JSON.stringify(mc));
await expectOk("the worker imports a campaign from another account the login reaches", "service_role", null,
  `select upsert_platform_campaigns('meta_ads', $1::jsonb)`, [JSON.stringify([{ campaign_id: "c22", account_id: "222", name: "Otro negocio", status: "active" }])]);
await expectOk("  ...and a TikTok one", "service_role", null,
  `select upsert_platform_campaigns('tiktok_ads', $1::jsonb)`, [JSON.stringify([{ campaign_id: "t1", account_id: "7001", name: "TikTok", status: "active" }])]);
await db.exec(`insert into campaigns (id, provider, name, status, account_id, origin)
               values ('dddddddd-0000-0000-0000-000000000022', 'meta_ads', 'Hecha aqui, en la 222', 'paused', '222', 'console')`);
const hasCampaign = async (where) => Number((await row(`select count(*) n from campaigns where ${where}`)).n) === 1;
const jobCount = async () => Number((await row(`select count(*) n from campaign_jobs`)).n);
await expectErr("staff cannot choose the account", "authenticated", STAFF, `select choose_ads_account('meta_ads', '111', 'page-1')`);
await expectErr("a visitor cannot choose the account", "anon", null, `select choose_ads_account('meta_ads', '111', 'page-1')`);
await expectErr("an account this connection does not see is refused", "authenticated", OWNER, `select choose_ads_account('meta_ads', '999', 'page-1')`);
await expectErr("Meta without a Page is refused", "authenticated", OWNER, `select choose_ads_account('meta_ads', '111')`);
await expectErr("Meta with a Page this connection does not see is refused", "authenticated", OWNER, `select choose_ads_account('meta_ads', '111', 'page-9')`);
await expectErr("a disconnected platform has nothing to choose", "authenticated", OWNER, `select choose_ads_account('tiktok_ads', '7001')`);
await expectErr("a delivery channel has no ad account", "authenticated", OWNER, `select choose_ads_account('ubereats', 's1')`);
check("  ...nothing chosen and nothing deleted by the refused calls", (await metaRow()).store_id === null && await hasCampaign(`platform_ids->>'campaign' = 'c22'`));
const jobsBefore = await jobCount();
await expectOk("owner chooses Go Picadera's account and Page", "authenticated", OWNER, `select choose_ads_account('meta_ads', '111', 'page-1')`);
mc = await metaRow();
check("  ...store_id is that one account; the Page, the moment and who chose are recorded",
  mc.store_id === "111" && mc.details.page_id === "page-1" && !!mc.details.chosen_at && mc.details.ad_accounts.length === 3 && mc.updated_by === OWNER, JSON.stringify(mc));
check("  ...the import from the other account is gone", !(await hasCampaign(`platform_ids->>'campaign' = 'c22'`)));
check("  ...imports from the chosen account stay", await hasCampaign(`platform_ids->>'campaign' = 'c9'`));
check("  ...campaigns made here stay, even one on another account",
  await hasCampaign(`id = 'dddddddd-0000-0000-0000-000000000022'`) && await hasCampaign(`id = '${LIVE}'`) && await hasCampaign(`id = '${DRAFT}'`));
check("  ...another platform's imports are untouched", await hasCampaign(`provider = 'tiktok_ads' and platform_ids->>'campaign' = 't1'`));
check("  ...and no job was queued", (await jobCount()) === jobsBefore);
const chosenAt = mc.details.chosen_at;
await connectMeta("Meta reconnects with the same login", "111,222,333", META_LISTS);
mc = await metaRow();
check("  ...keeps the chosen account and Page", mc.store_id === "111" && mc.details.page_id === "page-1" && mc.details.chosen_at === chosenAt, JSON.stringify(mc));
await connectMeta("Meta reconnects with a login that still sees the Page but not the account",
  "222,333", { ...META_LISTS, ad_accounts: META_LISTS.ad_accounts.slice(1) });
mc = await metaRow();
check("  ...drops the account, keeps the Page", mc.store_id === null && !mc.details.chosen_at && mc.details.page_id === "page-1", JSON.stringify(mc));
await connectMeta("  ...and once the account is reachable again", "111,222,333", META_LISTS);
check("  ...it is not chosen again by itself", (await metaRow()).store_id === null);
await expectOk("owner chooses again", "authenticated", OWNER, `select choose_ads_account('meta_ads', '111', 'page-1')`);
await connectMeta("Meta reconnects with a login that still sees the account but not the Page",
  "111,222", { ...META_LISTS, pages: [META_LISTS.pages[1]] });
mc = await metaRow();
check("  ...keeps the account, drops the Page", mc.store_id === "111" && !!mc.details.chosen_at && !("page_id" in mc.details), JSON.stringify(mc));
await expectOk("owner disconnects Meta, then it is connected again", "authenticated", OWNER,
  `update integrations set status = 'disconnected', client_secret = null where provider = 'meta_ads'`);
await connectMeta("  ...with the same login", "111,222,333", META_LISTS);
check("  ...a disconnect forgets the choice, like the Page and the token", (await metaRow()).store_id === null);
await db.exec(`update integrations set status = 'connected', client_secret = 'g-refresh',
                 details = '{"ad_accounts":[{"id":"1234567890","name":"Go Picadera"}]}' where provider = 'google_ads'`);
await expectOk("Google needs no Page", "authenticated", OWNER, `select choose_ads_account('google_ads', '1234567890')`);
const gc = await row(`select store_id, details from integrations where provider = 'google_ads'`);
check("  ...account chosen, no page_id", gc.store_id === "1234567890" && !("page_id" in gc.details), JSON.stringify(gc));
await db.exec(`update integrations set status = 'connected', client_secret = 'tt', store_id = '7001,7002', details = '{}' where provider = 'tiktok_ads'`);
await db.exec(sql("ads_accounts.sql"));
check("re-running ads_accounts.sql clears an account list nobody chose (what the old callback stored)",
  (await row(`select store_id from integrations where provider = 'tiktok_ads'`)).store_id === null);
check("  ...and keeps an account an owner chose", (await row(`select store_id from integrations where provider = 'google_ads'`)).store_id === "1234567890");

// ---- 8. the readiness query Fellito pastes in the SQL editor -----------------------------------------
console.log("\nreadiness query");
const [readiness, status] = await db.exec(sql("check_readiness.sql"));
const missing = readiness.rows.filter((r) => r.result !== "ok").map((r) => r.item);
check(`check_readiness.sql: all ${readiness.rows.length} items ok`, readiness.rows.length >= 23 && missing.length === 0, JSON.stringify(missing));
check("  ...and its status listing shows the three ad rows without any token",
  status.rows.length === 3 && !JSON.stringify(status.rows).includes("meta-tok") && !JSON.stringify(status.rows).includes("acc-1"));

// ---- 9. self-check -----------------------------------------------------------------------------------
console.log("\nself-check");
await db.exec(`create function noop() returns trigger language plpgsql as $$ begin return new; end $$;
               create trigger aa_early before update on orders for each row execute function noop();`);
const warnings = [];
await db.exec(sql("security_hardening.sql"), { onNotice: (n) => warnings.push(n.message) });
check("warns about a BEFORE trigger that sorts ahead of the guard", warnings.some((w) => w.includes("aa_early")), JSON.stringify(warnings));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
