import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-[#f6f7f9] lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(390px,1fr)]">
      <section className="relative hidden min-h-[100dvh] overflow-hidden bg-[#101820] lg:flex lg:flex-col lg:justify-end">
        {/* The existing IMS gym photograph is retained until the approved white-turf artwork is added to public/. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login-action.jpg" alt="Training at Innovative Movement Solutions" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07131e]/85 via-[#07131e]/55 to-[#07131e]/10" />
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[#07131e]/90 to-transparent" />
        <div className="relative z-10 max-w-3xl px-10 pb-14 xl:px-16">
          <div className="mb-7 h-1 w-14 rounded-full bg-[#3084b9]" />
          <h1 className="max-w-2xl text-5xl font-bold leading-[1.07] tracking-tight text-white xl:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
            Train Smarter.<br/><span className="text-[#69b9f4]">Move Better.</span><br/>Perform for Life.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/80">Your training, programs, progress and coaching in one place.</p>
          <div className="mt-12 flex items-center justify-between border-t border-white/25 pt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
            <span>Innovative Movement Solutions</span><span>Scripps Ranch, CA</span>
          </div>
        </div>
      </section>
      <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-7 sm:px-10 sm:py-12 lg:px-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,#dcecf7_0,transparent_68%)] opacity-80 lg:hidden" />
        <div className="relative z-10 w-full max-w-md">
          {children}
          <p className="mt-5 text-center text-xs sm:mt-8 text-[#8a94a2]">Innovative Movement Solutions · <Link href="/forgot-password" className="underline underline-offset-4 hover:text-[#267bb1]">Account help</Link></p>
        </div>
      </section>
    </main>
  );
}
