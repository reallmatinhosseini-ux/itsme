import crypto from "node:crypto";
import { sqlClient, ensureSchema } from "@/db/connection";

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

export async function getAuth(): Promise<AuthRow | null> {
  await ensureSchema();
  const r = await sqlClient.execute("SELECT hash, salt, secret FROM auth WHERE id = 1");
  const row = r.rows[0];
  return row ? { hash: row.hash as string, salt: row.salt as string, secret: row.secret as string } : null;
}

export async function hasPasscode(): Promise<boolean> {
  return (await getAuth()) != null;
}

export async function setPasscode(passcode: string): Promise<void> {
  await ensureSchema();
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(passcode, salt, 32).toString("hex");
  const secret = crypto.randomBytes(32).toString("hex");
  await sqlClient.execute({
    sql: "INSERT INTO auth (id, hash, salt, secret, updated_at) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, salt = excluded.salt, secret = excluded.secret, updated_at = excluded.updated_at",
    args: [hash, salt, secret, new Date().toISOString()],
  });
}

export async function clearPasscode(): Promise<void> {
  await ensureSchema();
  await sqlClient.execute("DELETE FROM auth WHERE id = 1");
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const a = await getAuth();
  if (!a) return false;
  const test = crypto.scryptSync(passcode, a.salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(a.hash, "hex"));
}

/** Session token changes whenever the passcode changes, signing every device out. */
export async function sessionToken(): Promise<string | null> {
  const a = await getAuth();
  return a ? crypto.createHmac("sha256", a.secret).update(a.hash).digest("hex") : null;
}

export async function isValidSession(cookie: string | undefined): Promise<boolean> {
  const t = await sessionToken();
  if (!t || !cookie || cookie.length !== t.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(t));
}

export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}
