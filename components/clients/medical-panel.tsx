import { AlertTriangle, Phone, Stethoscope } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Emergency and medical information, on the client's profile.
 *
 * All of this was collected at intake and then never shown again — which meant
 * the one moment it exists for (something going wrong on the floor) was the one
 * moment it couldn't be reached.
 *
 * Collapsed by default: it shouldn't sit open on a screen during a normal
 * session, but it's two taps away on a phone. The emergency contact stays
 * visible without expanding, because that's the number you'd need first.
 */

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function age(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

export async function MedicalPanel({ clientId }: { clientId: string }) {
  const svc = createServiceClient();
  const { data } = await svc
    .from("clients")
    .select(
      `date_of_birth, emergency_contact_name, emergency_contact_phone,
       emergency_contact_relationship, medical_conditions, medications,
       allergies, injury_history, physician_name, physician_phone`
    )
    .eq("id", clientId)
    .maybeSingle();

  if (!data) return null;
  const c = data as any;

  const conditions = asList(c.medical_conditions);
  const meds = asList(c.medications);
  const allergies = asList(c.allergies);
  const injuries = asList(c.injury_history);
  const clientAge = age(c.date_of_birth);

  const hasAnything =
    c.emergency_contact_name ||
    conditions.length ||
    meds.length ||
    allergies.length ||
    injuries.length ||
    c.physician_name;

  if (!hasAnything) {
    return (
      <div className="rounded-lg border border-divider bg-navy-soft p-5">
        <h3 className="text-base font-semibold text-cream">Medical &amp; emergency</h3>
        <p className="prose-ims text-sm text-cream-dim mt-1">
          Nothing on file. Send them the intake form to collect emergency contact
          and health history.
        </p>
      </div>
    );
  }

  const Row = ({ label, items }: { label: string; items: string[] }) =>
    items.length === 0 ? null : (
      <div>
        <div className="text-[11px] uppercase tracking-widest text-cream-faint">{label}</div>
        <ul className="mt-1 flex flex-col gap-0.5">
          {items.map((v, i) => (
            <li key={i} className="prose-ims text-sm text-cream">{v}</li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="rounded-lg border border-divider bg-navy-soft p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-cream">Medical &amp; emergency</h3>
        {clientAge !== null && (
          <span className="text-sm text-cream-faint tabular shrink-0">
            {clientAge} yrs
          </span>
        )}
      </div>

      {/* Always visible — this is the number you'd reach for first */}
      {c.emergency_contact_name && (
        <div className="rounded-md border border-status-limited/30 bg-status-limited/10 p-3">
          <div className="text-[11px] uppercase tracking-widest text-status-limited">
            Emergency contact
          </div>
          <div className="text-cream font-medium mt-1">
            {c.emergency_contact_name}
            {c.emergency_contact_relationship && (
              <span className="text-cream-faint font-normal">
                {" "}· {c.emergency_contact_relationship}
              </span>
            )}
          </div>
          {c.emergency_contact_phone && (
            <a
              href={`tel:${String(c.emergency_contact_phone).replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-1.5 text-sky mt-1 text-sm"
            >
              <Phone className="h-3.5 w-3.5" />
              {c.emergency_contact_phone}
            </a>
          )}
        </div>
      )}

      {/* Allergies sit outside the fold too — they're the fastest way to cause harm */}
      {allergies.length > 0 && (
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-status-moderate shrink-0 mt-0.5" />
          <span className="text-cream">
            <span className="text-cream-faint">Allergies: </span>
            {allergies.join(", ")}
          </span>
        </div>
      )}

      <details className="group">
        <summary className="cursor-pointer text-sm text-sky list-none select-none">
          <span className="group-open:hidden">Show health history</span>
          <span className="hidden group-open:inline">Hide health history</span>
        </summary>
        <div className="flex flex-col gap-3 mt-3 pt-3 border-t border-divider">
          <Row label="Conditions" items={conditions} />
          <Row label="Medications" items={meds} />
          <Row label="Injury history" items={injuries} />
          {c.physician_name && (
            <div>
              <div className="text-[11px] uppercase tracking-widest text-cream-faint">
                Physician
              </div>
              <div className="text-sm text-cream mt-1 flex items-center gap-1.5">
                <Stethoscope className="h-3.5 w-3.5 text-cream-faint" />
                {c.physician_name}
                {c.physician_phone && (
                  <a
                    href={`tel:${String(c.physician_phone).replace(/[^\d+]/g, "")}`}
                    className="text-sky"
                  >
                    {c.physician_phone}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
