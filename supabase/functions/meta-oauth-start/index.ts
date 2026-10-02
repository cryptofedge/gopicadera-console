// Deploy: supabase functions deploy meta-oauth-start --project-ref kfuamhhfthfmavxppagb
// (verify_jwt stays ON -- the default -- so only a signed-in console owner reaches the handler.)
import { handleMetaOAuthStart } from "../_shared/handlers.ts";

Deno.serve((req: Request) => handleMetaOAuthStart(req, { env: Deno.env.toObject(), fetch }));
