import { serverClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

// POST only. A GET sign-out can be triggered by any image tag or prefetch.
export async function POST(req: Request) {
  const sb = await serverClient();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
