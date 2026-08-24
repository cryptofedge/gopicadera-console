/**
 * A stand-in for the Supabase client, for the client-facing demo.
 *
 * The console reads and writes through a small, closed slice of the Supabase
 * API — select/eq/gte/in/order/single, update/insert/upsert, and one realtime
 * channel. This implements exactly that slice against in-memory data, so the
 * demo build needs no database, no keys, and no network.
 *
 * Edits are real within the session: change a price, toggle a dish, move stock,
 * and the console reflects it. Reloading the page puts everything back, which
 * is what you want from something handed to a client to poke at.
 */
import { seed, DEMO_USERS } from "./demo-data";

type Row = Record<string, unknown>;

// Deep copy so a demo session's edits never mutate the module-level seed.
const store: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));

const SESSION_KEY = "gp-demo-user";

function readSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null; // Private mode, or storage disabled.
  }
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => fn());
}

type Filter = { col: string; op: "eq" | "gte" | "in"; val: unknown };

function matches(row: Row, f: Filter): boolean {
  const v = row[f.col];
  if (f.op === "eq") return v === f.val;
  if (f.op === "in") return (f.val as unknown[]).includes(v);
  // gte on ISO date strings compares correctly lexicographically.
  return String(v) >= String(f.val);
}

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private sortBy: { col: string; asc: boolean } | null = null;
  private one = false;

  constructor(private table: string) {}

  select() { return this; }
  eq(col: string, val: unknown) { this.filters.push({ col, op: "eq", val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ col, op: "gte", val }); return this; }
  in(col: string, val: unknown[]) { this.filters.push({ col, op: "in", val }); return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    this.sortBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  single() { this.one = true; return this; }

  private rows(): Row[] {
    let out = (store[this.table] ?? []).filter((r) => this.filters.every((f) => matches(r, f)));
    if (this.sortBy) {
      const { col, asc } = this.sortBy;
      out = [...out].sort((a, b) => {
        const x = a[col] as string | number, y = b[col] as string | number;
        return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1);
      });
    }
    return out;
  }

  then<R1, R2 = never>(
    ok?: ((v: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
    fail?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const rows = this.rows();
    // A touch of latency, so loading states are visible rather than a flash.
    return new Promise<{ data: unknown; error: null }>((res) =>
      setTimeout(() => res({ data: this.one ? (rows[0] ?? null) : rows, error: null }), 120),
    ).then(ok, fail);
  }
}

class Mutation implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private returning = false;
  private one = false;
  private inserted: Row[] = [];
  constructor(
    private table: string,
    private kind: "update" | "insert" | "upsert",
    private payload: Row | Row[],
  ) {}

  eq(col: string, val: unknown) { this.filters.push({ col, op: "eq", val }); return this; }

  // insert(...).select("id").single() — the new-item form needs the id back so
  // it can log the opening stock count against it.
  select() { this.returning = true; return this; }
  single() { this.returning = true; this.one = true; return this; }

  private apply() {
    const list = (store[this.table] ??= []);

    if (this.kind === "update") {
      // Moving a ticket stamps whoever moved it, the same as the database
      // trigger does — otherwise the demo would show the column always empty.
      const stamping =
        this.table === "orders" && Object.keys(this.payload).includes("status");
      const me = stamping
        ? DEMO_USERS.find((u) => u.id === readSession())?.full_name ?? null
        : null;

      list.forEach((r) => {
        if (!this.filters.every((f) => matches(r, f))) return;
        Object.assign(r, this.payload);
        if (me) r.handled_by_name = me;
      });
      return;
    }

    const items = Array.isArray(this.payload) ? this.payload : [this.payload];
    for (const item of items) {
      // upsert matches on id for most tables, on key for settings.
      const idKey = this.table === "settings" ? "key" : "id";
      const existing = this.kind === "upsert"
        ? list.find((r) => r[idKey] !== undefined && r[idKey] === item[idKey])
        : undefined;
      if (existing) { Object.assign(existing, item); this.inserted.push(existing); }
      else {
        const row = { id: `demo-${Math.random().toString(36).slice(2, 9)}`, ...item };
        // A brand new inventory item starts at zero and derives its own flags,
        // exactly as the inventory_levels view would.
        if (this.table === "inventory_items") {
          Object.assign(row, { qty: 0, low: Number(item.reorder_level ?? 0) > 0, out_of_stock: true });
          (store.inventory_levels ??= []).push(row);
        }
        list.push(row);
        this.inserted.push(row);
      }
    }

    // A stock movement has to move the level it refers to, or the inventory
    // page would accept an adjustment and then show the old number.
    if (this.table === "stock_moves") {
      for (const m of items) {
        const lvl = (store.inventory_levels ?? []).find((r) => r.id === m.item_id);
        if (!lvl) continue;
        const qty = Number(lvl.qty ?? 0) + Number(m.delta ?? 0);
        lvl.qty = qty;
        lvl.out_of_stock = qty <= 0;
        lvl.low = qty <= Number(lvl.reorder_level ?? 0);
      }
    }
  }

  then<R1, R2 = never>(
    ok?: ((v: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
    fail?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return new Promise<{ data: unknown; error: null }>((res) =>
      setTimeout(() => {
        this.apply();
        const data = !this.returning ? null : this.one ? (this.inserted[0] ?? null) : this.inserted;
        res({ data, error: null });
      }, 140),
    ).then(ok, fail);
  }
}

export function demoClient() {
  return {
    from(table: string) {
      return {
        select: () => new Query(table),
        update: (payload: Row) => new Mutation(table, "update", payload),
        insert: (payload: Row | Row[]) => new Mutation(table, "insert", payload),
        upsert: (payload: Row | Row[]) => new Mutation(table, "upsert", payload),
      };
    },

    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        await new Promise((r) => setTimeout(r, 350));
        const u = DEMO_USERS.find(
          (x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password,
        );
        if (!u) return { data: null, error: { message: "Invalid login credentials" } };
        try { localStorage.setItem(SESSION_KEY, u.id); } catch {}
        notify();
        return { data: { user: { id: u.id } }, error: null };
      },

      async getUser() {
        const id = readSession();
        return { data: { user: id ? { id } : null }, error: null };
      },

      async signOut() {
        try { localStorage.removeItem(SESSION_KEY); } catch {}
        notify();
        return { error: null };
      },

      onAuthStateChange(cb: () => void) {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
    },

    // The order board subscribes to postgres_changes and reloads on any event.
    // Nothing external changes in a demo, so this is a no-op that satisfies the
    // same shape.
    channel() {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel() {},
  };
}
