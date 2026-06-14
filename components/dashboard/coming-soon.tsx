import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description?: string;
  next?: string[];
}

export function ComingSoon({ title, description, next }: ComingSoonProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-cream-dim mt-1">{description}</p>
        )}
      </div>

      <div className="rounded-lg border border-divider bg-navy-soft p-12 text-center">
        <Construction className="h-10 w-10 text-cream-faint mx-auto mb-3" />
        <h2 className="text-lg font-medium text-cream mb-1">
          Coming soon
        </h2>
        <p className="text-sm text-cream-dim max-w-md mx-auto">
          This surface is scaffolded but not yet built. The architecture and
          schema are in place — wiring up next.
        </p>
        {next && next.length > 0 && (
          <div className="mt-6 max-w-md mx-auto text-left">
            <div className="text-xs font-medium uppercase tracking-wider text-cream-faint mb-2">
              What's next
            </div>
            <ul className="text-sm text-cream-dim space-y-1.5">
              {next.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-sky-light">→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
