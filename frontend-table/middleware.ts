import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Public routes — reachable WITHOUT a Clerk session. Everything else requires a
// signed-in Clerk member (auth.protect() redirects to /sign-in).
//
// CREATING A GAME ALWAYS REQUIRES A LOGIN. /lobby is the game builder
// (PrivateTableSetup: private / public / play-money / tournament) and used to
// sit on this list, so an anonymous visitor could reach the create UI and only
// discovered it was forbidden when the server refused the click. There are
// rules about who may create a table; the UI must not pretend otherwise.
//
// JOINING WITH A CODE DOES NOT. A codeless visitor reaches the landing/auth
// pages, /clubs/join for the code, and the /table they were coded into. The
// backend join-code gate is the real boundary for joining, and the sit-down
// gate (guest approval) is the real boundary for sitting.
//
// /proof(.*) was here for a "cinematic showcase" route that no longer exists —
// the 3D table and its showcase are deleted. Removed.
//
// Admin/owner ROLE checks live in client guards on top of this.
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login',
  '/table(.*)',        // live game — a code link must OPEN, or people think it
                       // is broken. Watching is all this buys: taking a seat
                       // runs the sit-down gate, and an unregistered coded
                       // guest needs operator approval there.
  '/clubs/join',       // access-code entry (room_resolve) — the guest code path.
                       // This is what the list always CLAIMED was public and
                       // never was; /lobby was public in its place.
  '/diag',             // deploy self-check
  '/capabilities',     // marketing
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
