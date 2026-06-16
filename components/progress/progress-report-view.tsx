"use client";

import { TrendingUp, TrendingDown, Minus, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProgressReport, ProgressMetric } from "@/lib/queries/progress";

function deltaDisplay(m: ProgressMetric) {
  if (m.delta === null || m.baseline === null) return null;
  const improved =
    m.direction === "up_good" ? m.delta > 0 : m.delta < 0;
  const worsened =
    m.direction === "up_good" ? m.delta < 0 : m.delta > 0;
  const Icon = improved ? TrendingUp : worsened ? TrendingDown : Minus;
  const color = improved
    ? "text-status-optimal"
    : worsened
      ? "text-status-poor"
      : "text-cream-faint";
  const sign = m.delta > 0 ? "+" : "";
  return { Icon, color, text: `${sign}${Math.round(m.delta * 10) / 10}${m.unit}` };
}

/** Tiny inline sparkline. */
function Sparkline({ metric }: { metric: ProgressMetric }) {
  if (metric.series.length < 2) return null;
  const vals = metric.series.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const pts = metric.series
    .map((p, i) => {
      const x = (i / (metric.series.length - 1)) * w;
      const y = h - ((p.value - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--sky, #1c6fd6)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProgressReportView({
  report,
  clientName,
  forClient = false,
}: {
  report: ProgressReport;
  clientName?: string;
  forClient?: boolean;
}) {
  const hasData = report.metrics.some((m) => m.current !== null);

  if (!hasData) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-cream-faint">
          {forClient
            ? "Your progress report builds itself as you complete assessments. After your first re-assessment, you'll see how far you've come."
            : "No assessment data yet. Complete an assessment (and a re-assessment) to generate the progress report."}
        </CardContent>
      </Card>
    );
  }

  const span =
    report.firstAssessmentDate && report.latestAssessmentDate
      ? `${report.firstAssessmentDate} → ${report.latestAssessmentDate}`
      : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Headline */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sky">
            <Award className="h-5 w-5" />
            <span className="text-xs uppercase tracking-widest">
              {forClient ? "Your Progress" : `${clientName ?? "Client"} · Progress`}
            </span>
          </div>
          <p className="text-cream mt-2 text-lg">
            {report.sessionsCompleted} sessions completed
            {report.assessmentCount > 1
              ? ` · ${report.assessmentCount} assessments`
              : ""}
          </p>
          {span && (
            <p className="text-xs text-cream-faint mt-1">{span}</p>
          )}
        </CardContent>
      </Card>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {report.metrics.map((m) => {
          const d = deltaDisplay(m);
          return (
            <Card key={m.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {m.label}
                  {d && (
                    <span className={`flex items-center gap-1 text-sm ${d.color}`}>
                      <d.Icon className="h-4 w-4" />
                      {d.text}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-semibold text-cream">
                      {m.current ?? "—"}
                      <span className="text-base text-cream-faint ml-0.5">
                        {m.unit}
                      </span>
                    </div>
                    {m.baseline !== null && m.baseline !== m.current && (
                      <div className="text-xs text-cream-faint mt-0.5">
                        started at {m.baseline}
                        {m.unit}
                      </div>
                    )}
                  </div>
                  <Sparkline metric={m} />
                </div>
                <p className="text-xs text-cream-faint mt-3">{m.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-cream-faint">
        Movement Quality and Pain-Free Joints come from your IMS movement
        assessments. Strength reflects your capacity across the core patterns.
        Body composition comes from your scans. The more you train and
        re-assess, the clearer your story.
      </p>
    </div>
  );
}
