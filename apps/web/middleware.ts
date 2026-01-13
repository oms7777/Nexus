// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",

  // Realtime
  "/api/realtime/pusher-auth(.*)",

  // Tracker (IMPORTANT: allow CORS + anonymous)
  "/api/tracker/ensure-session(.*)",
  "/api/tracker/set-current-url(.*)",
  "/api/tracker/snapshot(.*)",
  "/api/tracker/log(.*)",
]);

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

  // ✅ CRITICAL: Let preflight pass through untouched
  if (req.method === "OPTIONS") {
    return NextResponse.next();
  }

  const { userId, orgId } = await auth();

  // ✅ Block direct sign-up (allow invite links)
  if (url.pathname.startsWith("/sign-up") && !isInviteSignUp(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", "/");
    return NextResponse.redirect(signInUrl);
  }

  // 🔓 Public routes stay public
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  // 🔐 Force org selection when user is logged but no org chosen
  if (userId && !orgId && !isOrgFreeRoute(req)) {
    const searchParams = new URLSearchParams({ redirectURL: req.url });
    const orgSelection = new URL(
      `/org-selection?${searchParams.toString()}`,
      req.url,
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
