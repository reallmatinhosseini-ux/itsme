import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/app-icon";

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Math.min(1024, Math.max(32, Number((await params).size) || 192));
  return new ImageResponse(<AppIcon size={n} />, { width: n, height: n });
}
