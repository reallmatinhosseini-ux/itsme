// Starts the app so your phone can reach it on the same Wi-Fi.
// Refuses to start until a passcode is set, so nobody else on the network can open it.
import { execSync, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = process.env.MISSION_DATA_DIR ?? path.join(process.cwd(), "data");
let hasPass = false;
try {
  const db = new Database(path.join(dataDir, "mission.db"), { readonly: true, fileMustExist: true });
  hasPass = !!db.prepare("SELECT 1 FROM auth WHERE id = 1").get();
  db.close();
} catch {}

if (!hasPass) {
  console.log("\n  Phone access is off. Run `npm run dev`, open http://localhost:3100/settings,\n  set a passcode under “Phone access”, then run `npm run phone` again.\n");
  process.exit(1);
}

const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
console.log("\n  Building…");
execSync("npx next build", { stdio: "inherit" });
console.log(`\n  ✓ Open on your phone (same Wi-Fi):  http://${ip ?? "<this-computer-ip>"}:3100`);
console.log("    Or scan the QR code on this computer at http://localhost:3100/settings\n");
spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", "3100"], { stdio: "inherit" });
