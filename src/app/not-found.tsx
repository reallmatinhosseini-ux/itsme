import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="glass mx-auto mt-16 max-w-lg p-7 text-center">
      <div className="eyebrow mb-2">404</div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Not found</h1>
      <p className="mt-2 text-[13px] text-ink-2">That record doesn&apos;t exist — it may have been deleted.</p>
      <div className="mt-5"><LinkButton href="/" variant="primary">Back to overview</LinkButton></div>
    </div>
  );
}
