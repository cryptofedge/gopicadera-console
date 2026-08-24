/**
 * Sample data for the client demo.
 *
 * Real dishes and real prices off the printed menu, so the console looks like
 * the restaurant rather than like a test fixture. Nothing here touches
 * Supabase — this is what the demo build serves instead.
 */

const now = Date.now();
const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(now - d * 864e5).toISOString();

export type Table = keyof typeof seed;

export const DEMO_USERS = [
  {
    id: "demo-owner",
    email: "richard@gopicadera.com",
    password: "Richard2026",
    full_name: "Richard (Dueño)",
    role: "owner" as const,
    active: true,
  },
  {
    id: "demo-owner-2",
    email: "llulisa@gopicadera.com",
    password: "Llulisa2026",
    full_name: "Llulisa (Dueña)",
    role: "owner" as const,
    active: true,
  },
  {
    id: "demo-staff",
    email: "yudelka@gopicadera.com",
    password: "Yudelka2026",
    full_name: "Yudelka (Staff)",
    role: "staff" as const,
    active: true,
  },
];

const STAFF = ["Yudelka Objío", "Luis Peña"];

export const seed = {
  profiles: [
    { id: "demo-owner", full_name: "Richard", role: "owner", active: true, created_at: daysAgo(220) },
    { id: "demo-owner-2", full_name: "Llulisa", role: "owner", active: true, created_at: daysAgo(220) },
    { id: "demo-staff", full_name: "Yudelka Objío", role: "staff", active: true, created_at: daysAgo(64) },
    { id: "demo-3", full_name: "Luis Peña", role: "staff", active: true, created_at: daysAgo(21) },
    { id: "demo-4", full_name: "Carmen Batista", role: "staff", active: false, created_at: daysAgo(200) },
  ],

  products: [
    { id: "p1",  slug: "empanadas",     name: "Empanadas",            price: 3.5,  available: true,  featured: true,  sort: 1,  category_id: "c1", categories: { slug: "picadera", name_es: "Picadera" } },
    { id: "p2",  slug: "pastelitos",    name: "Pastelitos",           price: 3.5,  available: true,  featured: false, sort: 2,  category_id: "c1", categories: { slug: "picadera", name_es: "Picadera" } },
    { id: "p3",  slug: "quipes",        name: "Quipes",               price: 3.0,  available: true,  featured: false, sort: 3,  category_id: "c1", categories: { slug: "picadera", name_es: "Picadera" } },
    { id: "p4",  slug: "chicharron",    name: "Chicharrón de cerdo",  price: 12.0, available: true,  featured: true,  sort: 4,  category_id: "c1", categories: { slug: "picadera", name_es: "Picadera" } },
    { id: "p5",  slug: "mofongo",       name: "Mofongo",              price: 14.0, available: true,  featured: true,  sort: 5,  category_id: "c2", categories: { slug: "platos",   name_es: "Platos" } },
    { id: "p6",  slug: "pernil",        name: "Pernil",               price: 13.0, available: true,  featured: false, sort: 6,  category_id: "c2", categories: { slug: "platos",   name_es: "Platos" } },
    { id: "p7",  slug: "pollo-guisado", name: "Pollo guisado",        price: 11.5, available: true,  featured: false, sort: 7,  category_id: "c2", categories: { slug: "platos",   name_es: "Platos" } },
    { id: "p8",  slug: "res-guisada",   name: "Res guisada",          price: 13.5, available: false, featured: false, sort: 8,  category_id: "c2", categories: { slug: "platos",   name_es: "Platos" } },
    { id: "p9",  slug: "tostones",      name: "Tostones",             price: 5.0,  available: true,  featured: false, sort: 9,  category_id: "c3", categories: { slug: "acomp",    name_es: "Acompañantes" } },
    { id: "p10", slug: "maduros",       name: "Maduros",              price: 5.0,  available: true,  featured: false, sort: 10, category_id: "c3", categories: { slug: "acomp",    name_es: "Acompañantes" } },
    { id: "p11", slug: "country-club",  name: "Country Club",         price: 2.5,  available: true,  featured: false, sort: 11, category_id: "c4", categories: { slug: "bebidas",  name_es: "Bebidas" } },
    { id: "p12", slug: "jarritos",      name: "Jarritos",             price: 2.5,  available: true,  featured: false, sort: 12, category_id: "c4", categories: { slug: "bebidas",  name_es: "Bebidas" } },
    { id: "p13", slug: "morir-sonando", name: "Morir Soñando",        price: 4.5,  available: true,  featured: true,  sort: 13, category_id: "c4", categories: { slug: "bebidas",  name_es: "Bebidas" } },
    { id: "p14", slug: "refresco",      name: "Refresco",             price: 2.0,  available: true,  featured: false, sort: 14, category_id: "c4", categories: { slug: "bebidas",  name_es: "Bebidas" } },
  ],

  inventory_levels: [
    { id: "i1",  kind: "ingredient", name: "Pernil (crudo)",     unit: "lb",  qty: 42,  reorder_level: 25, low: false, out_of_stock: false, track: true },
    { id: "i2",  kind: "ingredient", name: "Plátano verde",      unit: "und", qty: 18,  reorder_level: 40, low: true,  out_of_stock: false, track: true },
    { id: "i3",  kind: "ingredient", name: "Plátano maduro",     unit: "und", qty: 55,  reorder_level: 30, low: false, out_of_stock: false, track: true },
    { id: "i4",  kind: "ingredient", name: "Pollo (muslos)",     unit: "lb",  qty: 30,  reorder_level: 20, low: false, out_of_stock: false, track: true },
    { id: "i5",  kind: "ingredient", name: "Carne de res",       unit: "lb",  qty: 0,   reorder_level: 15, low: true,  out_of_stock: true,  track: true },
    { id: "i6",  kind: "ingredient", name: "Queso",              unit: "lb",  qty: 12,  reorder_level: 8,  low: false, out_of_stock: false, track: true },
    { id: "i7",  kind: "ingredient", name: "Harina",             unit: "lb",  qty: 60,  reorder_level: 25, low: false, out_of_stock: false, track: true },
    { id: "i8",  kind: "ingredient", name: "Aceite",             unit: "gal", qty: 4,   reorder_level: 3,  low: false, out_of_stock: false, track: true },
    { id: "i9",  kind: "product",    name: "Country Club Uva",   unit: "und", qty: 36,  reorder_level: 24, low: false, out_of_stock: false, track: true },
    { id: "i10", kind: "product",    name: "Country Club Piña",  unit: "und", qty: 9,   reorder_level: 24, low: true,  out_of_stock: false, track: true },
    { id: "i11", kind: "product",    name: "Jarritos Tamarindo", unit: "und", qty: 20,  reorder_level: 12, low: false, out_of_stock: false, track: true },
    { id: "i12", kind: "product",    name: "Coca-Cola",          unit: "und", qty: 48,  reorder_level: 24, low: false, out_of_stock: false, track: true },
    { id: "i13", kind: "product",    name: "Agua",               unit: "und", qty: 0,   reorder_level: 24, low: true,  out_of_stock: true,  track: true },
  ],

  orders: [
    { id: "o1", code: "GP-4821", source: "web", taken_by_name: null,             handled_by_name: "Yudelka Objío",      customer_name: "María Fernández", phone: "9175550142", mode: "pickup",   status: "new",     payment: "paid",   paid_at: minsAgo(4),  notified_at: minsAgo(4),  total: 27.5, loyalty_code: null,        note: "Sin cebolla",       created_at: minsAgo(4),
      order_items: [{ name: "Mofongo", qty: 1, unit_price: 14.0, options: ["Con pernil"] }, { name: "Empanadas", qty: 2, unit_price: 3.5, options: ["Pollo"] }, { name: "Morir Soñando", qty: 1, unit_price: 4.5, options: ["Sin azúcar"] }] },
    { id: "o2", code: "GP-4822", source: "whatsapp", taken_by_name: null,             handled_by_name: "Luis Peña", customer_name: "José Ramírez",    phone: "9175550198", mode: "delivery", status: "new",     payment: "paid",   paid_at: minsAgo(9),  notified_at: minsAgo(9),  total: 18.0, loyalty_code: null,        note: null,                created_at: minsAgo(9),
      order_items: [{ name: "Pernil", qty: 1, unit_price: 13.0, options: ["Con tostones"] }, { name: "Country Club", qty: 2, unit_price: 2.5, options: ["Uva"] }] },
    { id: "o3", code: "GP-4823", source: "ubereats", taken_by_name: null,             handled_by_name: "Yudelka Objío", customer_name: "Ana Beltré",      phone: "9175550177", mode: "delivery", status: "cooking", payment: "paid",   paid_at: minsAgo(16), notified_at: minsAgo(16), total: 41.0, loyalty_code: null,        note: "Extra picante",     created_at: minsAgo(16),
      order_items: [{ name: "Chicharrón de cerdo", qty: 2, unit_price: 12.0, options: [] }, { name: "Tostones", qty: 2, unit_price: 5.0, options: ["Sin sal"] }, { name: "Refresco", qty: 3, unit_price: 2.0, options: ["Coca-Cola"] }] },
    { id: "o4", code: "GP-4824", source: "walkin", taken_by_name: "Luis Peña",      handled_by_name: "Luis Peña",   customer_name: "Pedro Objío",     phone: "9175550110", mode: "pickup",   status: "cooking", payment: "unpaid", paid_at: null,        notified_at: null,        total: 22.5, loyalty_code: null,        note: null,                created_at: minsAgo(23),
      order_items: [{ name: "Pollo guisado", qty: 1, unit_price: 11.5, options: ["Con maduros"] }, { name: "Quipes", qty: 3, unit_price: 3.0, options: [] }, { name: "Refresco", qty: 1, unit_price: 2.0, options: ["Sprite"] }] },
    { id: "o5", code: "GP-4825", source: "phone", taken_by_name: "Yudelka Objío",  handled_by_name: "Yudelka Objío",    customer_name: "Luisa Guerrero",  phone: "9175550163", mode: "pickup",   status: "ready",   payment: "unpaid", paid_at: null,        notified_at: null,        total: 15.5, loyalty_code: "GP-LOYAL-77", note: "Cliente frecuente", created_at: minsAgo(31),
      order_items: [{ name: "Empanadas", qty: 3, unit_price: 3.5, options: ["Carne"] }, { name: "Morir Soñando", qty: 1, unit_price: 4.5, options: [] }] },
    { id: "o6", code: "GP-4826", source: "doordash", taken_by_name: null,             handled_by_name: "Luis Peña", customer_name: "Kelvin Mateo",    phone: "9175550154", mode: "delivery", status: "ready",   payment: "paid",   paid_at: minsAgo(38), notified_at: minsAgo(38), total: 31.0, loyalty_code: null,        note: null,                created_at: minsAgo(38),
      order_items: [{ name: "Mofongo", qty: 2, unit_price: 14.0, options: ["Con camarones"] }, { name: "Jarritos", qty: 1, unit_price: 2.5, options: ["Tamarindo"] }] },

    // Completed, so the reports page has something to add up.
    ...Array.from({ length: 34 }, (_, i) => {
      const menu = [
        ["Mofongo", 14.0], ["Pernil", 13.0], ["Empanadas", 3.5], ["Chicharrón de cerdo", 12.0],
        ["Pollo guisado", 11.5], ["Tostones", 5.0], ["Pastelitos", 3.5], ["Morir Soñando", 4.5],
      ] as const;
      const a = menu[i % menu.length];
      const b = menu[(i * 3 + 2) % menu.length];
      const qa = (i % 3) + 1;
      const src = ["web", "whatsapp", "walkin", "ubereats", "doordash", "phone"][i % 6];
      return {
        id: `d${i}`, code: `GP-47${(50 + i).toString().padStart(2, "0")}`, source: src,
        customer_name: "Cliente", phone: "9175550100", mode: i % 2 ? "delivery" : "pickup",
        taken_by_name: ["web", "whatsapp", "ubereats", "doordash"].includes(src) ? null : STAFF[i % 2],
        handled_by_name: STAFF[i % 2],
        status: "done", payment: "paid", total: Number((a[1] * qa + b[1]).toFixed(2)), loyalty_code: null, note: null,
        created_at: daysAgo((i % 7) + (i % 3) * 0.1),
        order_items: [
          { name: a[0], qty: qa, unit_price: a[1], options: [] },
          { name: b[0], qty: 1, unit_price: b[1], options: [] },
        ],
      };
    }),
    { id: "c1", code: "GP-4790", source: "ubereats", taken_by_name: null, handled_by_name: "Yudelka Objío", customer_name: "Wilkin Santos", phone: "9175550121", mode: "delivery", status: "cancelled", payment: "refunded", paid_at: null, notified_at: null, total: 24.0, loyalty_code: null, note: "Cliente canceló", created_at: daysAgo(1),
      order_items: [{ name: "Mofongo", qty: 1, unit_price: 14.0, options: [] }, { name: "Chicharrón de cerdo", qty: 1, unit_price: 12.0, options: [] }] },
    { id: "c2", code: "GP-4772", source: "phone", taken_by_name: "Luis Peña", handled_by_name: "Luis Peña", customer_name: "Rosa Jiménez", phone: "9175550188", mode: "pickup", status: "cancelled", payment: "unpaid", paid_at: null, notified_at: null, total: 11.5, loyalty_code: null, note: "No vino a recoger", created_at: daysAgo(3),
      order_items: [{ name: "Pollo guisado", qty: 1, unit_price: 11.5, options: [] }] },
  ],

  // Cancelled ones exist so the history filter is not a list of successes.
  // They live in `orders` too; this array is spread into it above.
  settings: [
    { key: "hours", value: [
      { open: 11, close: 23 }, { open: 11, close: 23 }, { open: 11, close: 23 },
      { open: 11, close: 23 }, { open: 11, close: 23 }, { open: 11, close: 25 },
      { open: 11, close: 25 },
    ] },
    { key: "whatsapp", value: "17185551234" },
  ],

  integrations: [
    { kind: "delivery", provider: "ubereats", status: "connected",    store_id: "UE-4471-BK", client_id: "ue_live_8821", has_secret: true,  last_order_at: minsAgo(16), last_error: null, auto_accept: true },
    { kind: "delivery", provider: "doordash", status: "connected",    store_id: "DD-90233",   client_id: "dd_live_3390", has_secret: true,  last_order_at: minsAgo(38), last_error: null, auto_accept: false },
    { kind: "delivery", provider: "grubhub",  status: "pending",      store_id: null,         client_id: null,           has_secret: false, last_order_at: null,        last_error: null, auto_accept: false },
    { kind: "messaging", provider: "whatsapp", status: "connected",    store_id: "17185551234", client_id: "wa_biz_1120", has_secret: true,  last_order_at: minsAgo(4),  last_error: null, auto_accept: false },
    { kind: "pos", provider: "square",     status: "connected",    store_id: "SQ-BK-4820", client_id: "sq0idp-91x", has_secret: true,  last_order_at: minsAgo(23), last_error: null, auto_accept: false },
    { kind: "pos", provider: "clover",     status: "disconnected", store_id: null,         client_id: null,         has_secret: false, last_order_at: null,        last_error: null, auto_accept: false },
    { kind: "pos", provider: "toast",      status: "disconnected", store_id: null,         client_id: null,         has_secret: false, last_order_at: null,        last_error: null, auto_accept: false },
    { kind: "pos", provider: "lightspeed", status: "disconnected", store_id: null,         client_id: null,         has_secret: false, last_order_at: null,        last_error: null, auto_accept: false },
  ] as Record<string, unknown>[],

  stock_moves: [] as Record<string, unknown>[],
};
