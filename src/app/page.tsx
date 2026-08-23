"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The console has no landing page — signed in you want the order board, signed
 * out the console layout bounces you to the login form.
 */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/orders");
  }, [router]);
  return null;
}
