"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cx } from "./ui";

export function ThemeToggle({ className }: { className?: string }) {
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(document.documentElement.getAttribute("data-theme") === "light"); }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    const el = document.documentElement;
    if (next) el.setAttribute("data-theme", "light");
    else el.removeAttribute("data-theme");
    try { localStorage.setItem("theme", next ? "light" : "dark"); } catch {}
  };

  return (
    <button
      onClick={toggle}
      aria-label={light ? "Switch to dark" : "Switch to light"}
      className={cx("group relative inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-1 text-ink-3 transition hover:text-ink", className)}
    >
      <span className={cx("grid size-7 place-items-center rounded-full transition", !light && "bg-ink/[0.08] text-ink")}><Moon className="size-[15px]" /></span>
      <span className={cx("grid size-7 place-items-center rounded-full transition", light && "bg-ink/[0.08] text-ink")}><Sun className="size-[15px]" /></span>
    </button>
  );
}
