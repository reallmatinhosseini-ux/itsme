import crypto from "node:crypto";
import { db } from "@/db/connection";

/**
 * Single-user passcode stored as a scrypt hash in the database.
 * Without a passcode the app only answers requests made on this computer;
 * any other device (your phone on Wi-Fi) is sent to the lock screen.
 */
export const COOKIE = "mission_session";

interface AuthRow {
  hash: string;
  salt: string;
  secret: string;
}

const raw = () => db.$client;

export function getAuth(): AuthRow | null {
  return (raw().prepare("SELECT hash, salt, secret FROM auth WHERE id = 1").get() as AuthRow | undefined) ?? null;
}

export function hasPasscode(): boolean {
  return getAuth() != null;
}

export function setPasscode(passcode: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(passcode, salt, 32).toString("hex");
  const secret = crypto.randomBytes(32).toString("hex");
  raw()
    .prepare("INSERT INTO auth (id, hash, salt, secret, updated_at) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, salt = excluded.salt, secret = excluded.secret, updated_at = excluded.updated_at")
    .run(hash, salt, secret, new Date().toISOString());
}

export function clearPasscode() {
  raw().prepare("DELETE FROM auth WHERE id = 1").run();
}

export function verifyPasscode(passcode: string): boolean {
  const a = getAuth();
  if (!a) return false;
  const test = crypto.scryptSync(passcode, a.salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(a.hash, "hex"));
}

/** Session token changes whenever the passcode changes, signing every device out. */
export function sessionToken(): string | null {
  const a = getAuth();
  return a ? crypto.createHmac("sha256", a.secret).update(a.hash).digest("hex") : null;
}

export function isValidSession(cookie: string | undefined): boolean {
  const t = sessionToken();
  if (!t || !cookie || cookie.length !== t.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(t));
}

export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}
