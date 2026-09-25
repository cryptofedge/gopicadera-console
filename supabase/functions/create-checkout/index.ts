// Deploy: supabase functions deploy create-checkout --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
// (--no-verify-jwt because the storefront calls it with the publishable key, which is not a JWT.
//  The function needs no login: it only accepts an order code and reads every amount from the database.)
import { handleCreateCheckout } from "../_shared/handlers.ts";

Deno.serve((req: Request) => handleCreateCheckout(req, { env: Deno.env.toObject(), fetch }));
