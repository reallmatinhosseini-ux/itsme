export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-3 h-3 w-28 rounded bg-ink/[0.06]" />
      <div className="mb-8 h-8 w-80 rounded-lg bg-ink/85" />
      <div className="grid gap-4 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="glass h-56" />)}
        <div className="glass h-72 xl:col-span-3" />
      </div>
    </div>
  );
}
