"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Password field with a show/hide toggle.
 *
 * Masking exists to defeat shoulder-surfing, which is close to irrelevant when
 * someone is setting up their account alone on their phone — and it's the main
 * reason older clients get locked out on a typo they can't see. Defaulting to
 * hidden but letting them look is the right trade.
 */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = "current-password",
  required,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        // Big enough to hit reliably on a phone.
        className="absolute right-0 top-0 h-full px-3 flex items-center text-cream-faint hover:text-cream"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
