import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-[100dvh] bg-[#f4f6f8] lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,.9fr)]">
    <section className="relative hidden min-h-[100dvh] overflow-hidden bg-[#111418] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      <Image src="/login-action.jpg" alt="" fill priority className="object-cover opacity-55"/>
      <div className="absolute inset-0 bg-gradient-to-br from-[#101317]/95 via-[#101317]/72 to-[#101317]/28"/>
      <div className="relative z-10"><Image src="/ims-logo.png" alt="Innovative Movement Solutions" width={230} height={80} priority className="h-auto w-[210px] brightness-0 invert"/></div>
      <div className="relative z-10 max-w-xl pb-6"><p className="mb-4 text-xs font-semibold uppercase tracking-[.24em] text-[#72b8e4]">IMS Fitness · Scripps Ranch</p><h1 className="text-5xl font-bold leading-[.98] text-white xl:text-6xl">Train smarter.<br/>Move better.<br/><span className="text-[#72b8e4]">Perform for life.</span></h1><p className="mt-6 max-w-md text-base leading-7 text-white/70">Training, programs, progress and direct access to your coach—all in one place.</p></div>
    </section>
    <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5 py-8 sm:px-10 lg:px-14">
      <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#d9edf9] blur-3xl"/>
      <div className="relative z-10 w-full max-w-[430px]">{children}<p className="mt-6 text-center text-xs text-[#778391]">Innovative Movement Solutions · <Link href="/forgot-password" className="font-medium text-[#1c6a9c] hover:underline">Account help</Link></p></div>
    </section>
  </main>;
}
