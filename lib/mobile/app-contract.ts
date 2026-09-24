export const IMS_MOBILE = {
  appName: "IMS Fitness",
  bundleId: "com.imsfitness.app",
  urlScheme: "imsfitness",
  universalLinkHost: "imsfitnesscenter.com",
  clientRoutes: ["/dashboard","/programs","/workouts/log","/book","/progress","/messages","/account"] as const,
} as const;

export function safeMobileNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  const pathname = value.split("?")[0].split("#")[0];
  return IMS_MOBILE.clientRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"))
    ? value
    : "/dashboard";
}
