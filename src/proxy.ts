import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PREFIXES = ["/api/public", "/api/kustom", "/api/auth", "/api/cron"];
const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_PATHS.includes(pathname);

  if (isPublic) {
    return NextResponse.next();
  }

  if (req.auth) {
    // Kassabiträden (rollen cashier) ser bara kassan - allt annat skickas
    // dit. Server actions skyddas dessutom av requireCurrentAdmin.
    if (req.auth.user?.role === "cashier" && !isKassaPath(pathname)) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return new NextResponse("Kassabiträden har bara tillgång till kassan.", { status: 403 });
      }
      return NextResponse.redirect(new URL("/kassa", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.nextUrl.origin);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
});

function isKassaPath(pathname: string): boolean {
  return pathname === "/kassa" || pathname.startsWith("/kassa/");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|logo/).*)"],
};
