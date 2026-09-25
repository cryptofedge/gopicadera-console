// Deploy: supabase functions deploy stripe-status --project-ref kfuamhhfthfmavxppagb
// (verify_jwt stays ON -- the DEFAULT, unlike create-checkout/stripe-webhook -- so only a signed-in
// console user reaches the handler at all; the handler then checks that user is specifically an owner.)
import { handleStripeStatus } from "../_shared/handlers.ts";

Deno.serve((req: Request) => handleStripeStatus(req, { env: Deno.env.toObject(), fetch }));
