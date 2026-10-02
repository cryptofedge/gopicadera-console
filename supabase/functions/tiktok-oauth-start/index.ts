// Deploy: supabase functions deploy tiktok-oauth-start --project-ref kfuamhhfthfmavxppagb
// (verify_jwt stays ON -- the default -- so only a signed-in console owner reaches the handler.)
import { handleTiktokOAuthStart } from "../_shared/handlers.ts";

Deno.serve((req: Request) => handleTiktokOAuthStart(req, { env: Deno.env.toObject(), fetch }));
