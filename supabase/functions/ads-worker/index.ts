// Deploy: supabase functions deploy ads-worker --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
// (--no-verify-jwt because the caller is the database itself, via pg_cron / pg_net -- not a signed-in
// user. The x-ads-worker-secret header, checked before anything else, is what lets a request in.)
import { handleAdsWorker } from "../_shared/ads-worker.ts";

Deno.serve((req: Request) => handleAdsWorker(req, { env: Deno.env.toObject(), fetch }));
