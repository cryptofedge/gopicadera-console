"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import LoginForm from "./LoginForm";

function Login() {
  const next = useSearchParams().get("next");
  // Only same-site paths, so ?next=https://evil.example can't turn the login
  // form into an open redirect.
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/orders";
  return <LoginForm next={safe} />;
}

/**
 * useSearchParams has to sit under a Suspense boundary, otherwise it opts the
 * route out of static generation — which a static export cannot allow. This
 * used to be a server component reading searchParams directly; there is no
 * server now.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}
