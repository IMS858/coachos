import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start With IMS | Phone or In-Person Consultation",
  description:
    "Choose a short introductory phone conversation or a free 30-minute in-person personal training consultation with Jason Patterson at IMS in Scripps Ranch.",
};

const vagaroUrl = "https://www.vagaro.com/innovativemovementsolutions/book-now";

export default function ConsultPage() {
  return (
    <main className="min-h-screen bg-[#111b29] px-5 py-12 text-[#f7f3e9] sm:py-20">
      <div className="mx-auto max-w-4xl">
        <Link href="https://imsmethod.com/" className="text-sm font-semibold tracking-[.2em] text-[#8ac8e8]">
          IMS METHOD
        </Link>
        <p className="mt-12 text-xs font-bold uppercase tracking-[.24em] text-[#8ac8e8]">Start here</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
          One conversation. A plan that fits you.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#d4dae0]">
          New to coaching? Choose how you want to meet Jason. We&apos;ll learn what you want to achieve
          and help you decide on the right next step.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-[#456277] bg-[#1c2c3d] p-7">
            <p className="text-xs font-bold uppercase tracking-widest text-[#8ac8e8]">Option 01</p>
            <h2 className="mt-3 text-2xl font-bold">Quick phone consultation</h2>
            <p className="mt-4 leading-relaxed text-[#d4dae0]">
              Talk about your goals, training experience and questions before coming in.
              Phone appointments are currently arranged directly so we don&apos;t offer a time
              that conflicts with Jason&apos;s full studio calendar.
            </p>
            <a
              href="tel:+16199371434"
              className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[#8ac8e8] px-5 py-3 text-center font-bold text-[#111b29] hover:bg-white"
            >
              Call to arrange a phone consultation
            </a>
            <a
              href="https://imsmethod.com/contact.html"
              className="mt-4 inline-block text-sm font-semibold text-[#8ac8e8] underline underline-offset-4"
            >
              Prefer to message first?
            </a>
          </section>

          <section className="rounded-2xl border border-[#456277] bg-[#1c2c3d] p-7">
            <p className="text-xs font-bold uppercase tracking-widest text-[#8ac8e8]">Option 02</p>
            <h2 className="mt-3 text-2xl font-bold">Free in-person consultation</h2>
            <p className="mt-4 leading-relaxed text-[#d4dae0]">
              Meet Jason at the IMS studio in Scripps Ranch for your existing 30-minute
              Personal Training Consultation. Vagaro manages the live calendar and your
              existing participation waiver.
            </p>
            <a
              href={vagaroUrl}
              className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[#8ac8e8] px-5 py-3 text-center font-bold text-[#111b29] hover:bg-white"
              rel="noopener noreferrer"
            >
              See available in-person times
            </a>
            <p className="mt-4 text-sm text-[#b9c5d1]">
              Choose &ldquo;Personal Training Consultation&rdquo; with Jason Patterson.
            </p>
          </section>
        </div>

        <section className="mt-12 rounded-xl border border-[#456277] p-6">
          <h2 className="text-xl font-bold">Before we meet</h2>
          <p className="mt-3 leading-relaxed text-[#d4dae0]">
            In your booking note, tell Jason your main goal, whether you&apos;ve worked with a coach
            before, and what made you reach out now. If you book in person, complete the existing
            waiver in Vagaro before your visit. Please share personal health information only
            through your secure Vagaro forms, not general website messages.
          </p>
        </section>

        <p className="mt-10 text-center text-sm text-[#b9c5d1]">
          IMS · 10625 Scripps Ranch Blvd, Suite D · San Diego, CA 92131
        </p>
      </div>
    </main>
  );
}
