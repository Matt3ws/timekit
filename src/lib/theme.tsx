import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "timekit-theme";

const prefersDark = (): boolean =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const resolve = (theme: Theme): "light" | "dark" =>
  theme === "system" ? (prefersDark() ? "dark" : "light") : theme;

const apply = (theme: Theme): void => {
  document.documentElement.classList.toggle("dark", resolve(theme) === "dark");
};

const readStored = (): Theme => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
};

/** Apply the persisted theme synchronously before React mounts, to avoid a flash. */
export const initTheme = (): void => apply(readStored());

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "system", setTheme: () => {} });

/** Provides the current theme and lets descendants switch between light, dark, and system. */
export const ThemeProvider = ({ children }: { children: ReactNode }): React.JSX.Element => {
  const [theme, setThemeState] = useState<Theme>(readStored);

  const setTheme = useCallback((next: Theme): void => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
    apply(next);
  }, []);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};

/** Read and update the active theme. */
export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
