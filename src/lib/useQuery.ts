"use client";

/**
 * The smallest thing that replaces a server component's `await`.
 *
 * Every console page used to fetch its rows on the server and render once. In
 * the browser that becomes fetch-then-render, and each page would otherwise
 * repeat the same loading/error/refetch bookkeeping. This is that bookkeeping,
 * once.
 */
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserClient } from "./supabase-browser";

type Result<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useQuery<T>(
  run: (sb: SupabaseClient) => PromiseLike<{ data: T | null; error: unknown }>,
  deps: unknown[] = [],
): Result<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      const res = await run(browserClient() as unknown as SupabaseClient);
      // A result that arrives after the component unmounted, or after the
      // inputs changed, must not overwrite newer state.
      if (cancelled) return;
      if (res.error) {
        setError(
          typeof res.error === "object" && res.error && "message" in res.error
            ? String((res.error as { message: unknown }).message)
            : "No se pudieron cargar los datos.",
        );
        setData(null);
      } else {
        setError(null);
        setData(res.data);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload };
}
