"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  MessageCircle,
  PlusCircle,
  Search,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types/database";

/**
 * Command palette — ⌘K / Ctrl+K from anywhere.
 *
 * Two result groups:
 *   1. Actions/navigation (static, filtered locally)
 *   2. Clients (debounced fetch to /api/command/search, RLS-scoped)
 *
 * Mounted once in AppShell for trainer/owner roles.
 */

interface Action {
  label: string;
  href: string;
  icon: LucideIcon;
  keywords: string;
}

const ACTIONS: Action[] = [
  { label: "Quick Log a session", href: "/sessions/new?mode=log", icon: PlusCircle, keywords: "log session quick record" },
  { label: "New client", href: "/clients/new", icon: PlusCircle, keywords: "add create client new" },
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, keywords: "dashboard home today overview" },
  { label: "Clients", href: "/clients", icon: Users, keywords: "clients roster people" },
  { label: "Schedule", href: "/schedule", icon: CalendarDays, keywords: "schedule calendar sessions week" },
  { label: "Programs", href: "/programs", icon: Dumbbell, keywords: "programs plans workouts" },
  { label: "Assessments", href: "/assessments", icon: ClipboardList, keywords: "assessments fra movement" },
  { label: "Library", href: "/library", icon: Dumbbell, keywords: "library exercises videos" },
  { label: "Messages", href: "/messages", icon: MessageCircle, keywords: "messages chat inbox" },
];

interface ClientHit {
  id: string;
  name: string;
  status: string;
}

export function CommandPalette({ role }: { role: UserRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientHit[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open / close on ⌘K or Ctrl+K, close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset + focus when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setClients([]);
      setHighlighted(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Debounced client search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setClients([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/command/search?q=${encodeURIComponent(query.trim())}`
        );
        if (!res.ok) return;
        const json = await res.json();
        setClients(json.results ?? []);
      } catch {
        // network hiccup — palette stays usable with nav actions
      }
    }, 180);
  }, [query]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ACTIONS;
    return ACTIONS.filter(
      (a) =>
        a.label.toLowerCase().includes(q) || a.keywords.includes(q)
    );
  }, [query]);

  // Flat list for keyboard navigation: clients first when searching
  const items = useMemo(() => {
    const clientItems = clients.map((c) => ({
      key: `client-${c.id}`,
      label: c.name,
      sub: c.status,
      href: `/clients/${c.id}`,
      icon: User,
    }));
    const actionItems = filteredActions.map((a) => ({
      key: `action-${a.href}`,
      label: a.label,
      sub: undefined as string | undefined,
      href: a.href,
      icon: a.icon,
    }));
    return query.trim().length >= 2
      ? [...clientItems, ...actionItems]
      : actionItems;
  }, [clients, filteredActions, query]);

  useEffect(() => {
    setHighlighted(0);
  }, [items.length]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && items[highlighted]) {
      e.preventDefault();
      go(items[highlighted].href);
    }
  }

  if (role === "client") return null;

  return (
    <>
      {/* Discreet trigger — also makes the feature discoverable on touch */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-divider bg-navy-elev px-4 py-2.5 text-xs text-cream-dim shadow-none hover:bg-navy-soft hover:text-cream"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-divider px-1.5 py-0.5 text-[10px] text-cream-faint sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-navy-deep/70 px-4 pt-[14vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <div className="page-enter w-full max-w-lg overflow-hidden rounded-xl border border-divider bg-navy-elev">
            <div className="flex items-center gap-3 border-b border-divider px-4">
              <Search className="h-4 w-4 shrink-0 text-cream-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search clients, or jump anywhere…"
                className="h-12 w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream-faint"
                aria-label="Search"
              />
              <kbd className="shrink-0 rounded border border-divider px-1.5 py-0.5 text-[10px] text-cream-faint">
                esc
              </kbd>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {query.trim().length >= 2 && clients.length > 0 && (
                <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-widest text-cream-faint">
                  Clients
                </div>
              )}
              {items.map((item, i) => {
                const Icon = item.icon;
                const isClientHeaderBoundary =
                  query.trim().length >= 2 &&
                  clients.length > 0 &&
                  i === clients.length;
                return (
                  <div key={item.key}>
                    {isClientHeaderBoundary && (
                      <div className="px-2 pb-1 pt-3 text-[10px] uppercase tracking-widest text-cream-faint">
                        Go to
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => go(item.href)}
                      onMouseEnter={() => setHighlighted(i)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm",
                        i === highlighted
                          ? "bg-sky/15 text-cream"
                          : "text-cream-dim"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          i === highlighted
                            ? "text-sky-light"
                            : "text-cream-faint"
                        )}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.sub && (
                        <span className="text-[10px] uppercase tracking-wider text-cream-faint">
                          {item.sub}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
              {items.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-cream-faint">
                  No matches for “{query}”
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
