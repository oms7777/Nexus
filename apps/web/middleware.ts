// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Routes publiques accessibles depuis des sites externes (embed / tracking)
 * ⚠️ IMPORTANT : ces routes doivent rester accessibles sans auth Clerk
 */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",

  // realtime
  "/api/realtime/pusher-auth(.*)",

  // tracker (called from customer websites)
  "/api/tracker/ensure-session(.*)",
  "/api/tracker/set-current-url(.*)",
  "/api/tracker/snapshot(.*)",
  "/api/tracker/log(.*)",
]);

/**
 * Routes accessibles sans organisation sélectionnée
 */
const isOrgFreeRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/org-selection(.*)",
]);

function isInviteSignUp(req: Request) {
  const url = new URL(req.url);

  const keys = [
    "__clerk_invitation",
    "__clerk_ticket",
    "invitation",
    "invitation_token",
    "invite",
    "invite_token",
    "ticket",
    "token",
  ];

  return keys.some((k) => url.searchParams.has(k));
}

export default clerkMiddleware(async (auth, req) => {
  const url = new URL(req.url);

  /**
   * ✅ CRITICAL — Handle CORS preflight BEFORE Clerk
   * This is mandatory for embeds on external domains
   */
  if (
    req.method === "OPTIONS" &&
    (url.pathname.startsWith("/api/tracker/") ||
      url.pathname.startsWith("/api/realtime/"))
  ) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, X-Requested-With, Authorization",
        "Vary": "Origin",
      },
    });
  }

  const { userId, orgId } = await auth();

  /**
   * 🚫 Block direct sign-up except via invite
   */
  if (url.pathname.startsWith("/sign-up") && !isInviteSignUp(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", "/");
    return NextResponse.redirect(signInUrl);
  }

  /**
   * 🔓 Public routes stay public (NO Clerk protect)
   */
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  /**
   * 🔐 Force org selection if user is logged but no org selected
   */
  if (userId && !orgId && !isOrgFreeRoute(req)) {
    const searchParams = new URLSearchParams({ redirectURL: req.url });
    const orgSelection = new URL(
      `/org-selection?${searchParams.toString()}`,
      req.url
    );
    return NextResponse.redirect(orgSelection);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
