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
          alt="Coaching at IMS"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-deep via-navy-deep/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-10">
          <p className="text-3xl font-semibold text-white leading-tight">
            The outcome is up to you.
          </p>
          <p className="text-cream-faint mt-2">
            Innovative Movement Solutions · Scripps Ranch
          </p>
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
