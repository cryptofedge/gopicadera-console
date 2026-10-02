// Deploy: supabase functions deploy meta-oauth-callback --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
// (--no-verify-jwt because this is a plain top-level redirect from Meta -- it carries no Supabase
// login. Security here is the signed state parameter, checked before anything else runs.)
import { handleMetaOAuthCallback } from "../_shared/handlers.ts";

Deno.serve((req: Request) => handleMetaOAuthCallback(req, { env: Deno.env.toObject(), fetch }));
