"use client";

import Link from "next/link";

export default function AssessmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto py-12 px-6 text-center">
      <h1 className="text-xl font-semibold text-cream">
        Something went wrong loading this assessment
      </h1>
      <p className="text-sm text-cream-faint mt-2">
        The page hit an error. The details below help diagnose it.
      </p>
      <pre className="mt-4 text-left text-xs bg-navy-deep border border-divider rounded-lg p-4 overflow-x-auto text-amber-300 whitespace-pre-wrap">
        {error.message || "Unknown error"}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>
      <div className="flex gap-3 justify-center mt-4">
        <button
          onClick={reset}
          className="text-sm text-sky hover:underline"
        >
          Try again
        </button>
        <Link href="/assessments" className="text-sm text-cream-faint hover:text-cream">
          ← Back to assessments
        </Link>
      </div>
    </div>
  );
}
