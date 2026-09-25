// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt --project-ref kfuamhhfthfmavxppagb
// (--no-verify-jwt because Stripe cannot send a Supabase login. Security here is the Stripe signature.)
import { handleStripeWebhook } from "../_shared/handlers.ts";

Deno.serve((req: Request) => handleStripeWebhook(req, { env: Deno.env.toObject(), fetch }));
