import { LoginBrandMotion } from "@/components/layout/login-brand-motion";
import { BUILD_ID } from "@/lib/build-info";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-navy-deep lg:grid lg:grid-cols-2">
      {/* Brand / photo side (desktop) */}
      <div className="relative hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-action.jpg"
          alt="Jason Patterson coaching a client through hip mobility work at IMS"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#17191c] via-[#17191c]/55 to-transparent" />
        <LoginBrandMotion />
        <div className="absolute bottom-0 left-0 right-0 p-10">
          <p className="text-4xl font-bold text-white leading-[1.05]" style={{ fontFamily: "var(--font-display)" }}>
            The outcome is up to you.
          </p>
          <p className="text-xs uppercase text-white/60 mt-3" style={{ letterSpacing: "0.18em" }}>
            Innovative Movement Solutions · Scripps Ranch
          </p>
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md">
          {children}
          <p className="text-center text-[10px] text-cream-faint mt-6">build {BUILD_ID}</p>
        </div>
      </div>
    </div>
  );
}
