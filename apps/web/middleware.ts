// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const IS_PUBLIC_ROUTE = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",

  // realtime
  "/api/realtime/pusher-auth(.*)",


  "/api/tracker/snapshot(.*)",
  "/api/tracker/log(.*)",
]);

const IS_ORG_FREE_ROUTE = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/org-selection(.*)",
]);

/** Visiteurs anonymes (pas de session Clerk) — court-circuiter Clerk avant auth(). */
const IS_ANONYMOUS_INGESTION_ROUTE = createRouteMatcher([
  "/api/realtime/pusher-auth(.*)",
  "/api/tracker/snapshot(.*)",
  "/api/tracker/log(.*)",
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

  // ✅ MAJ: laisser passer les preflight CORS
  if (req.method === "OPTIONS") {
    return NextResponse.next();
  }

  // ✅ Posts depuis le site client / iframe sans cookie Clerk — ne pas invoquer auth()
  if (IS_ANONYMOUS_INGESTION_ROUTE(req)) {
    return NextResponse.next();
  }

  const { userId, orgId } = await auth();

  // ✅ bloque le sign-up direct (autorise via lien d'invite)
  if (url.pathname.startsWith("/sign-up") && !isInviteSignUp(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", "/");
    return NextResponse.redirect(signInUrl);
  }

  // 🔓 pages publiques (sign-in, etc.)
  if (!IS_PUBLIC_ROUTE(req)) {
    await auth.protect();
  }

  // 🔐 force org selection
  if (userId && !orgId && !IS_ORG_FREE_ROUTE(req)) {
    const searchParams = new URLSearchParams({ redirectURL: req.url });
    const orgSelection = new URL(`/org-selection?${searchParams.toString()}`, req.url);
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
