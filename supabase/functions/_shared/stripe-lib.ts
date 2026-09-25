// Pure helpers for the Stripe Edge Functions. Nothing here touches Deno globals or the network, so
// the same file runs in Supabase's Deno runtime and in the Node tests (ops/stripe-functions.test.mjs).
// Only erasable TypeScript (types and interfaces) is used, so Node can run it as is.

export type Env = Record<string, string | undefined>;

export interface CheckoutItem {
  name: string;
  options: { label: string }[];
  qty: number;
  unit_cents: number;
}
export interface CheckoutOrder {
  code: string;
  mode: string;
  phone?: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  attempt: number;
  items: CheckoutItem[];
}

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Constant-time comparison, so a wrong signature cannot be found out one character at a time.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

// Stripe signs "<timestamp>.<raw body>" with the endpoint's signing secret (whsec_...). The header looks
// like: t=1700000000,v1=<hex>,v1=<hex>. Accept if ANY v1 matches and the timestamp is recent, which
// stops a captured request from being replayed later.
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowSec: number,
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") sigs.push(v);
  }
  if (!/^\d{9,12}$/.test(t) || sigs.length === 0) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const expected = await hmacSha256Hex(secret, t + "." + rawBody);
  return sigs.some((s) => safeEqual(s, expected));
}

// Stripe's API takes form-encoded bodies with bracket notation: line_items[0][price_data][currency]=usd
export function formEncode(obj: unknown, prefix = "", out: [string, string][] = []): [string, string][] {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) obj.forEach((v, i) => formEncode(v, `${prefix}[${i}]`, out));
  else if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) formEncode(v, prefix ? `${prefix}[${k}]` : k, out);
  } else out.push([prefix, String(obj)]);
  return out;
}
export const toFormBody = (obj: unknown): string => new URLSearchParams(formEncode(obj)).toString();

// The Checkout Session for one order. Every amount comes from the order the DATABASE priced; before
// building it we re-check that the lines and the tax add up to the total, and refuse if they do not.
export function buildCheckoutParams(o: CheckoutOrder, siteUrl: string, nowSec: number) {
  const sum = o.items.reduce((s, i) => s + i.unit_cents * i.qty, 0);
  if (sum !== o.subtotal_cents || o.subtotal_cents + o.tax_cents !== o.total_cents) {
    throw new Error("order amounts do not add up");
  }
  for (const i of o.items) {
    if (!Number.isInteger(i.unit_cents) || i.unit_cents < 0 || !Number.isInteger(i.qty) || i.qty < 1) throw new Error("bad line item");
  }
  const line_items = o.items.map((i) => ({
    quantity: i.qty,
    price_data: {
      currency: "usd",
      unit_amount: i.unit_cents,
      product_data: {
        name: i.name.slice(0, 120),
        ...(i.options.length ? { description: i.options.map((x) => x.label).join(" · ").slice(0, 300) } : {}),
      },
    },
  }));
  if (o.tax_cents > 0) {
    line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: o.tax_cents, product_data: { name: "Impuesto (8.875%)" } } });
  }
  // The order page (pedido.html) finds an order by code AND phone, and the phone rides in the URL fragment,
  // which is never sent to any server. The storefront collects the phone before paying; if an order somehow
  // has none, Stripe asks for it, so the WhatsApp confirmation can still be sent.
  const tel = (o.phone || "").replace(/\D/g, "");
  const hasPhone = tel.length >= 10;
  return {
    mode: "payment",
    client_reference_id: o.code,
    line_items,
    phone_number_collection: { enabled: !hasPhone },
    success_url: `${siteUrl}/pedido.html?code=${encodeURIComponent(o.code)}&paid=1${hasPhone ? "#tel=" + encodeURIComponent(o.phone as string) : ""}`,
    cancel_url: `${siteUrl}/?pago=cancelado`,
    expires_at: nowSec + 1800, // 30 minutes, Stripe's minimum
    metadata: { order_code: o.code, mode: o.mode },
    payment_intent_data: { description: `Go Picadera ${o.code}`, metadata: { order_code: o.code } },
  };
}

export function corsHeaders(origin: string, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, apikey, authorization", "Vary": "Origin" };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });
}
