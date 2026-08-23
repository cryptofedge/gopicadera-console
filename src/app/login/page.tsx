import LoginForm from "./LoginForm";

/**
 * Server component. It reads `?next=` here and passes it down, which avoids
 * useSearchParams() in the client component — that hook opts the route out of
 * static prerendering unless it is wrapped in a Suspense boundary, and this
 * page has no reason to need one.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only same-site paths, so ?next=https://evil.example can't turn the login
  // form into an open redirect.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/orders";
  return <LoginForm next={safeNext} />;
}
