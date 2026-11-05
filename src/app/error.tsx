"use client";

import { buttonClass } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="glass mx-auto mt-16 max-w-lg p-7">
      <div className="eyebrow mb-2">Something went wrong</div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em]">This view couldn&apos;t be loaded</h1>
      <p className="mt-2 text-[13px] leading-5 text-ink-2">{error.message || "An unexpected error occurred."} Your data has not been changed.</p>
      <button onClick={reset} className={`${buttonClass("primary")} mt-5`}>Try again</button>
    </div>
  );
}
