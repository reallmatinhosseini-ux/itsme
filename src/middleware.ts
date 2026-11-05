import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, hasPasscode, isLocalHost, isValidSession } from "@/lib/auth";

const OPEN = ["/login", "/api/login", "/manifest.webmanifest", "/icons/", "/apple-icon", "/icon"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  const local = isLocalHost(req.headers.get("host"));
  if (!(await hasPasscode())) {
    // No passcode yet: this computer only. Other devices see the lock screen explaining how to enable access.
    if (local) return NextResponse.next();
    return redirect(req, "/login?locked=1");
  }
  if (await isValidSession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  return redirect(req, "/login");
}

function redirect(req: NextRequest, to: string) {
  const url = req.nextUrl.clone();
  const [path, query] = to.split("?");
  url.pathname = path;
  url.search = query ? `?${query}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
