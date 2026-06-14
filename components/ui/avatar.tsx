/**
 * Deterministic colorful avatar from a name.
 * Same name always gets the same color — no images required.
 */

const PALETTES = [
  "from-sky-500/80 to-blue-600/80",
  "from-emerald-500/80 to-teal-600/80",
  "from-amber-500/80 to-orange-600/80",
  "from-violet-500/80 to-purple-600/80",
  "from-rose-500/80 to-pink-600/80",
  "from-cyan-500/80 to-sky-600/80",
  "from-lime-500/80 to-green-600/80",
  "from-fuchsia-500/80 to-violet-600/80",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const palette = PALETTES[hashName(name) % PALETTES.length];
  const sizeClass =
    size === "sm"
      ? "h-7 w-7 text-[10px]"
      : size === "lg"
        ? "h-12 w-12 text-base"
        : "h-9 w-9 text-xs";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${palette} ${sizeClass} font-semibold text-white shrink-0 select-none`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
