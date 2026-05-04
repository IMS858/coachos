"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useState, useTransition } from "react";

interface ClientsFilterProps {
  initialSearch: string;
  initialStatus: string;
}

export function ClientsFilter({
  initialSearch,
  initialStatus,
}: ClientsFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(initialSearch);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.replace(`/clients?${params.toString()}`);
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    updateParam("q", searchValue);
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <form onSubmit={handleSearch} className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-faint" />
        <input
          type="search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onBlur={() => updateParam("q", searchValue)}
          placeholder="Search by name…"
          className="w-full h-10 rounded-md border border-divider bg-navy-deep pl-9 pr-3 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky"
        />
      </form>

      <select
        value={initialStatus}
        onChange={(e) => updateParam("status", e.target.value)}
        className="h-10 rounded-md border border-divider bg-navy-deep px-3 text-sm text-cream focus:outline-none focus:ring-2 focus:ring-sky"
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="lead">Lead</option>
        <option value="paused">Paused</option>
        <option value="churned">Churned</option>
      </select>
    </div>
  );
}
