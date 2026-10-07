// Deploy: supabase functions deploy google-ads-oauth-start --project-ref kfuamhhfthfmavxppagb
// (verify_jwt stays ON -- the default -- so only a signed-in console owner reaches the handler.)
import { handleGoogleAdsOAuthStart } from "../_shared/handlers.ts";

Deno.serve((req: Request) => handleGoogleAdsOAuthStart(req, { env: Deno.env.toObject(), fetch }));
