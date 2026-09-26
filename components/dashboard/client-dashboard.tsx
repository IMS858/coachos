import Link from "next/link";
import type {ReactNode} from "react";
import {z} from "zod";
import {Calendar, TrendingUp, Activity, Dumbbell, MessageCircle} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {PACIFIC, pacificWeek, pacificDate, addCalendarDays} from "@/lib/time/pacific";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
import {captureEvidence} from "@/lib/fuel/today";

const panel = "min-w-0 rounded-2xl border border-divider bg-white p-5";
const toolLink = "flex min-h-20 items-center gap-3 rounded-2xl border border-divider bg-white px-4 py-3 text-sm font-semibold text-sky";
const sessionSchema = z.object({id: z.string().uuid(), scheduled_at: z.string().datetime({offset: true}), status: z.string()});
const mobilitySchema = z.object({id: z.string().uuid(), name: z.string(), duration_minutes: z.number().nullable(), frequency: z.string().nullable()});
const bodySchema = z.object({recorded_at: z.string(), weight_lb: z.number().finite().nullable(), body_fat_pct: z.number().finite().nullable(), method: z.string()});

/** Today is first; secondary evidence stays scoped, optional and independently fallible. */
export async function ClientDashboard({fullName, children}: {fullName: string; children?: ReactNode}) {
  const db = await createClient();
  const {data: {user}} = await db.auth.getUser();
  if (!user) return null;
  const now = new Date(), week = pacificWeek(now);
  const [sessions, mobility, completions, body] = await Promise.all([
    captureEvidence(async () => {
      const rows = await readCompleteEvidence<z.infer<typeof sessionSchema>>((a, b) => db.from("sessions")
        .select("id,scheduled_at,status", {count: "exact"}).eq("client_id", user.id)
        .gte("scheduled_at", week.start.toISOString()).lt("scheduled_at", week.end.toISOString()).order("id").range(a, b));
      return rows.map(row => sessionSchema.parse(row));
    }, "Your weekly calendar could not be loaded. No session count was assumed."),
    captureEvidence(async () => {
      const result = await db.from("mobility_assignments").select("id,name,duration_minutes,frequency")
        .eq("client_id", user.id).eq("active", true).order("created_at", {ascending: false}).limit(1).maybeSingle();
      if (result.error || result.data === undefined) throw Error("Mobility read failed.");
      return result.data === null ? null : mobilitySchema.parse(result.data);
    }, "Your assigned mobility routine could not be loaded."),
    captureEvidence(async () => {
      const rows = await readCompleteEvidence<{id: string; completed_on: string}>((a, b) => db.from("mobility_completions")
        .select("id,completed_on", {count: "exact"}).eq("client_id", user.id)
        .gte("completed_on", week.startDate).lte("completed_on", week.today).order("id").range(a, b));
      return new Set(rows.map(row => {
        if (typeof row.completed_on !== "string" || row.completed_on < week.startDate || row.completed_on > week.today) throw Error("Completion date unavailable.");
        return row.completed_on;
      })).size;
    }, "Mobility report coverage could not be loaded. No zero was assumed."),
    captureEvidence(async () => {
      const result = await db.from("body_comp_records").select("recorded_at,weight_lb,body_fat_pct,method")
        .eq("client_id", user.id).order("recorded_at", {ascending: false}).limit(1).maybeSingle();
      if (result.error || result.data === undefined) throw Error("Progress read failed.");
      return result.data === null ? null : bodySchema.parse(result.data);
    }, "Your latest body-composition record could not be loaded."),
  ]);
  const hour = Number(new Intl.DateTimeFormat("en-US", {timeZone: PACIFIC, hour: "numeric", hourCycle: "h23"}).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return <div className="flex min-w-0 flex-col gap-4 pb-8">
    <header className="relative -mx-4 -mt-4 overflow-hidden bg-band">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/studio-hero.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover"/>
      <div className="absolute inset-0 bg-gradient-to-r from-[#17191c] via-[#17191c]/85 to-[#17191c]/35"/>
      <div className="relative px-5 py-7 text-white"><p className="text-xs uppercase tracking-[.18em] text-white/70">{greeting}</p><h1 className="mt-1 text-4xl font-bold">{fullName.split(" ")[0]}.</h1><p className="mt-2 text-sm text-white/80">Your training, fuel and coach. One day at a time.</p></div>
    </header>
    {children}
    <nav aria-label="My IMS tools" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Link href="/plan" className={toolLink}><Dumbbell className="h-5 w-5 shrink-0" aria-hidden="true"/><span>Train →</span></Link>
      <Link href="/fuel" className={toolLink}><Activity className="h-5 w-5 shrink-0" aria-hidden="true"/><span>Fuel →</span></Link>
      <Link href="/progress" className={toolLink}><TrendingUp className="h-5 w-5 shrink-0" aria-hidden="true"/><span>Progress →</span></Link>
      <Link href="/messages" className={toolLink}><MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true"/><span>Coach →</span></Link>
    </nav>
    <div className="flex flex-wrap gap-x-5 gap-y-1 px-1"><Link href="/plan#exercise-videos" className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">Exercise videos &amp; feedback →</Link><Link href="/messages" className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">Assessment questions →</Link></div>
    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-cream">This week · booked sessions</h2><Link href="/book" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky"><Calendar className="h-4 w-4"/><span>Book →</span></Link></div>
      {sessions.status === "unavailable" ? <p role="alert" className="mt-3 text-sm leading-6 text-cream-dim">{sessions.message}</p> : <><div className="mt-3 grid grid-cols-7 gap-1">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => {
        const date = addCalendarDays(week.startDate, index);
        const rows = sessions.value.filter(s => pacificDate(new Date(s.scheduled_at)) === date);
        const completed = rows.filter(s => s.status === "completed").length;
        const booked = rows.filter(s => ["scheduled", "confirmed"].includes(s.status)).length;
        const description = completed ? `${completed} completed` : booked ? `${booked} booked` : "No active booking";
        return <div key={label} className={`rounded-xl px-1 py-3 text-center ${index === week.weekday ? "bg-sky/10 ring-1 ring-sky/30" : "bg-surface-soft"}`} aria-label={`${label}, ${date}: ${description}`}><p className="text-xs font-semibold text-cream-dim">{label}</p><p className="mt-2 text-sm font-bold text-cream">{completed ? "✓" : booked || "—"}</p><p className="mt-1 text-[10px] text-cream-faint">{completed ? "done" : booked ? "booked" : "open"}</p></div>;
      })}</div><p className="mt-3 text-xs leading-5 text-cream-faint">{week.startDate}–{addCalendarDays(week.startDate, 6)} · Pacific. Open dates are not assumed rest days. Canceled appointments do not count as bookings.</p></>}
    </section>
    <div className="grid gap-4 md:grid-cols-2">
      <section className={panel}><h2 className="font-semibold text-cream">Assigned mobility</h2>{mobility.status === "unavailable" ? <p role="alert" className="mt-3 text-sm text-cream-dim">{mobility.message}</p> : mobility.value ? <><h3 className="mt-3 text-lg font-semibold text-cream">{mobility.value.name}</h3><p className="mt-2 text-sm text-cream-dim">{mobility.value.duration_minutes === null ? "Duration not assigned" : `${mobility.value.duration_minutes} minutes`} · {mobility.value.frequency || "Frequency not assigned"}</p><Link href="/plan" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-sky">Open my routine →</Link></> : <p className="mt-3 text-sm text-cream-dim">No active mobility routine is assigned. Your training remains available.</p>}
        {completions.status === "unavailable" ? <p role="alert" className="mt-3 text-xs leading-5 text-cream-dim">{completions.message}</p> : <p className="mt-3 text-xs leading-5 text-cream-faint">{completions.value} days with a mobility report this week. No universal weekly target is assumed.</p>}
      </section>
      <section className={panel}><h2 className="font-semibold text-cream">Latest recorded measurement</h2>{body.status === "unavailable" ? <p role="alert" className="mt-3 text-sm text-cream-dim">{body.message}</p> : body.value ? <><p className="mt-3 text-xs text-cream-faint">{body.value.recorded_at} · {body.value.method.replaceAll("_", " ")}</p><dl className="mt-3 grid grid-cols-2 gap-3"><div><dt className="text-xs text-cream-faint">Body weight</dt><dd className="mt-1 text-lg font-semibold text-cream">{body.value.weight_lb === null ? "Not recorded" : `${body.value.weight_lb} lb`}</dd></div><div><dt className="text-xs text-cream-faint">Body fat</dt><dd className="mt-1 text-lg font-semibold text-cream">{body.value.body_fat_pct === null ? "Not recorded" : `${body.value.body_fat_pct}%`}</dd></div></dl></> : <p className="mt-3 text-sm leading-6 text-cream-dim">No body-composition measurement is recorded. Testing is optional, not a requirement to train.</p>}<Link href="/progress" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-sky">View my progress →</Link></section>
    </div>
  </div>;
}
