"use client";

import { useEffect, useState } from "react";

/*
 * Light/dark switch. The real theme is applied pre-paint by the inline
 * script in layout.tsx (no flash); this button just flips the attribute and
 * persists the choice. Icon resolves after mount to avoid a hydration
 * mismatch, since the server can't know the stored preference.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(
      (document.documentElement.dataset.theme as "light" | "dark") ?? "dark"
    );
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      title="Toggle theme"
      className="flex h-8 w-9 items-center justify-center border border-line text-ink-2 hover:border-accent hover:text-ink"
    >
      {/* Placeholder keeps width stable until the client resolves the theme. */}
      <span aria-hidden>{theme === "light" ? "☾" : theme === "dark" ? "☀" : ""}</span>
    </button>
  );
}
