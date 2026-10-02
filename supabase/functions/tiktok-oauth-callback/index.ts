// Deploy: supabase functions deploy tiktok-oauth-callback --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
// (--no-verify-jwt because this is a plain top-level redirect from TikTok -- it carries no Supabase
// login. Security here is the signed state parameter, checked before anything else runs.)
import { handleTiktokOAuthCallback } from "../_shared/handlers.ts";

Deno.serve((req: Request) => handleTiktokOAuthCallback(req, { env: Deno.env.toObject(), fetch }));
