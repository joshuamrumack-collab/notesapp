// Interface language. Texts are written in English in the code; t() looks up the Swedish version.
// Notes themselves are never translated.
import { sv } from "./i18n-sv";

export type Lang = "en" | "sv";
const KEY = "notesapp.lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "sv") return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== "undefined" && /^sv\b/i.test(navigator.language) ? "sv" : "en";
}

let lang: Lang = detect();

export const getLang = () => lang;

export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.lang = l;
  window.dispatchEvent(new Event("notesapp:lang"));
}

/** Translate an interface text. {0}, {1} are filled with the arguments. */
export function t(text: string, ...args: (string | number)[]): string {
  const out = lang === "sv" ? (sv[text] ?? text) : text;
  return args.length ? out.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m)) : out;
}

/** For tests: every English text that has no Swedish version yet. */
export const missingSwedish = (texts: string[]) => texts.filter((x) => !(x in sv));
