export default function ActionCenterLoading() {
  return <main aria-busy={true} aria-live="polite" className="mx-auto min-h-[60dvh] w-full max-w-6xl rounded-3xl bg-white p-6 text-cream"><p className="text-xs font-semibold uppercase tracking-widest text-sky">IMS Coach OS</p><h1 className="mt-3 text-3xl font-bold">Loading Action Center</h1><p className="mt-3 text-sm leading-6 text-cream-dim">Checking your role-scoped queues. Counts will appear after their evidence loads.</p></main>;
}
