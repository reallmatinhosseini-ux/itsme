import { NextResponse } from "next/server";
import { COOKIE, sessionToken, verifyPasscode } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const given = String(form.get("passcode") ?? "");
  const base = new URL(req.url);
  // Small constant delay blunts brute-force attempts.
  await new Promise((r) => setTimeout(r, 400));
  if (!verifyPasscode(given)) return NextResponse.redirect(new URL("/login?error=1", base), 303);
  const res = NextResponse.redirect(new URL("/", base), 303);
  res.cookies.set(COOKIE, sessionToken()!, { httpOnly: true, sameSite: "lax", secure: base.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return res;
}
