import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, hasPasscode, isValidSession } from "@/lib/auth";

const OPEN = ["/login", "/api/login", "/manifest.webmanifest", "/icons/", "/apple-icon", "/icon"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  // No passcode set: the app is open everywhere (the user chose not to lock it).
  if (!(await hasPasscode())) return NextResponse.next();
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
