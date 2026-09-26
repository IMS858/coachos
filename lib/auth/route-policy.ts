const HANDLER_AUTH_ROUTES = new Set([
  "/api/webhooks/stripe",
  "/api/cron/low-balance",
  "/api/cron/recurring",
  "/api/cron/session-reminders",
  "/api/intake/submit",
  "/api/intake/waivers",
  "/api/integrations/website-lead",
]);

/** Only these exact endpoints authenticate without a browser session. */
export function usesHandlerAuthentication(path: string): boolean {
  return HANDLER_AUTH_ROUTES.has(path);
}

/** Client program details have their own ownership and publication checks. */
export function isStaffPage(path: string): boolean {
  return ["/clients", "/assessments"].some(root => path === root || path.startsWith(root + "/"))
    || path === "/programs"
    || (path.startsWith("/programs/") && !/^\/programs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path));
}
