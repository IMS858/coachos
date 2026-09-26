"use client";
export function ReloadPageButton({ label = "Reload page" }: { label?: string }) {
  return <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-divider bg-white px-4 py-2 text-sm font-semibold text-sky focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{label}</button>;
}
