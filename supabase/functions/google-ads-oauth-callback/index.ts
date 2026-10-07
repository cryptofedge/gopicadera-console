// Deploy: supabase functions deploy google-ads-oauth-callback --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
// (--no-verify-jwt because this is a plain top-level redirect from Google -- it carries no Supabase
// login. Security here is the signed state parameter, checked before anything else runs.)
import { handleGoogleAdsOAuthCallback } from "../_shared/handlers.ts";

Deno.serve((req: Request) => handleGoogleAdsOAuthCallback(req, { env: Deno.env.toObject(), fetch }));
