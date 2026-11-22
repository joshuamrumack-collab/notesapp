// Colour themes. The choice is kept on this computer and applies to every notebook.
export interface Theme {
  id: string;
  name: string;
  note: string;
  dark: boolean;
  /** Preview colours: sidebar, page, text, accent. */
  swatch: [string, string, string, string];
}

export const THEMES: Theme[] = [
  { id: "light", name: "Light", note: "Clean and bright", dark: false, swatch: ["#ecebe6", "#ffffff", "#23262b", "#1f7a6d"] },
  { id: "dark", name: "Dark", note: "Easy on the eyes at night", dark: true, swatch: ["#1f2227", "#1b1e23", "#e6e7ea", "#4fb8a6"] },
  { id: "parchment", name: "Parchment", note: "Warm paper and book type", dark: false, swatch: ["#e5d9bf", "#f9f3e5", "#3a2f22", "#8a4b2a"] },
  { id: "forest", name: "Forest", note: "Dark green, calm", dark: true, swatch: ["#18231d", "#151e19", "#e2ece5", "#82c99f"] },
  { id: "contrast", name: "High contrast", note: "Black on white, larger text", dark: false, swatch: ["#ffffff", "#ffffff", "#000000", "#0040a8"] },
];

const KEY = "notesapp.theme";

export function savedTheme(): string {
  try {
    const t = localStorage.getItem(KEY);
    if (t && THEMES.some((x) => x.id === t)) return t;
  } catch {
    /* storage unavailable */
  }
  // First start: follow Windows' light or dark setting.
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(id: string, remember = true) {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  if (remember) {
    try {
      localStorage.setItem(KEY, theme.id);
    } catch {
      /* storage unavailable */
    }
  }
  // Match the window's title bar in the desktop app.
  if ("__TAURI_INTERNALS__" in window) {
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme.dark ? "dark" : "light"))
      .catch(() => {});
  }
}
