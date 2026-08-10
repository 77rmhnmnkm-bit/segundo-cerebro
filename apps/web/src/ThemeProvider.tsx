import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getTheme, type Theme, type ThemeMode } from "@app/ui";

const ThemeContext = createContext<{ theme: Theme; mode: ThemeMode; toggleMode: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("sc_theme_mode");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const theme = useMemo(() => getTheme(mode), [mode]);

  useEffect(() => {
    localStorage.setItem("sc_theme_mode", mode);
    const root = document.documentElement.style;
    for (const [key, value] of Object.entries(theme.colors)) {
      root.setProperty(`--color-${key}`, value);
    }
  }, [theme]);

  function toggleMode() {
    setMode((m) => (m === "light" ? "dark" : "light"));
  }

  return <ThemeContext.Provider value={{ theme, mode, toggleMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
