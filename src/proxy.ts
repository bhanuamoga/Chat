import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Route protection — Next.js 16 "Proxy" (middleware).
 * 
 * - Unauthenticated visitors hitting /chat or /groups are redirected to /
 * - Authenticated visitors hitting / are redirected to /chat
 */
const PROTECTED_PREFIXES = ["/chat", "/groups", "/natural"];

export const proxy = auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const isLoggedIn = Boolean(req.auth);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !isLoggedIn) {
    const signInUrl = new URL("/", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (pathname === "/" && isLoggedIn) {
    return NextResponse.redirect(new URL("/chat", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
