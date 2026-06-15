/**
 * Patch for apps/web/app/clients/page.tsx
 *
 * Find the "New client" Button in the header (around line 50) and wrap it
 * in a Link so it navigates to /clients/new.
 *
 * BEFORE:
 *   <Button>
 *     <Plus className="h-4 w-4" />
 *     New client
 *   </Button>
 *
 * AFTER:
 *   <Link href="/clients/new">
 *     <Button>
 *       <Plus className="h-4 w-4" />
 *       New client
 *     </Button>
 *   </Link>
 *
 * Make sure `import Link from "next/link";` is at the top (it already is from
 * the prior bundle).
 */
