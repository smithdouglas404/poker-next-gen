import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Public routes — reachable WITHOUT a Clerk session. Everything else requires a
// signed-in Clerk member (auth.protect() redirects to /sign-in). The guest path
// is deliberately narrow: a codeless visitor can reach only the landing/auth
// pages, the table-code entry (/clubs/join), and the live /table they were coded
// into — the backend join-code gate (#83) is the real boundary for actually
// sitting. Admin/owner ROLE checks live in client guards on top of this.
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login',
  '/join',             // public plan picker, reached before account creation
  '/table(.*)',        // live game — guests with a table code play here
  '/lobby(.*)',        // access-code entry (room_resolve) — the guest code path
  '/diag',             // deploy self-check
  '/capabilities',     // marketing
  '/proof(.*)',        // cinematic showcase
  '/provably-fair(.*)', // public fairness verification
  '/api/health(.*)',   // health endpoints
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals + static assets; run on everything else + API.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|cur|heic|heif|mp4)(?:\\?.*)?|.*\\.(?:sqlite|db)$).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
};
