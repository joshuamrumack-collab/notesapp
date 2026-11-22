export const LINK_RE = /(!?)\[\[([^[\]\n]+?)\]\]/g;

/** "Folder/Page#Heading|alias" -> "Folder/Page" */
export function linkTarget(raw: string): string {
  return raw.split("|")[0].split("#")[0].trim();
}

export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(LINK_RE)) if (!m[1]) out.push(linkTarget(m[2]));
  return out.filter(Boolean);
}

const lastSegment = (t: string) => t.slice(t.lastIndexOf("/") + 1).replace(/\.(md|canvas)$/i, "");

/** Rewrite [[Old]] links (also [[Folder/Old|alias]] and [[Old#h]]) to point at a new page name. */
export function replaceLinks(text: string, oldName: string, newName: string): { text: string; count: number } {
  let count = 0;
  const lower = oldName.toLowerCase();
  const out = text.replace(LINK_RE, (whole, bang: string, inner: string) => {
    if (bang) return whole;
    const pipe = inner.indexOf("|");
    const targetPart = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const alias = pipe >= 0 ? inner.slice(pipe) : "";
    const hash = targetPart.indexOf("#");
    const name = hash >= 0 ? targetPart.slice(0, hash) : targetPart;
    const heading = hash >= 0 ? targetPart.slice(hash) : "";
    if (lastSegment(name.trim()).toLowerCase() !== lower) return whole;
    count++;
    const prefix = name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : "";
    return `[[${prefix}${newName}${heading}${alias}]]`;
  });
  return { text: out, count };
}

/** Links inside card fields: "[[Page]]" strings, lists of them, and unquoted YAML [[Page]] (parsed as nested lists). */
export function propertyLinks(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const visit = (v: unknown, depth: number) => {
    if (typeof v === "string") out.push(...extractLinks(v));
    else if (Array.isArray(v)) {
      if (depth > 0 && v.length === 1 && typeof v[0] === "string") out.push(linkTarget(v[0]));
      else for (const x of v) visit(x, depth + 1);
    }
  };
  for (const [k, v] of Object.entries(data)) if (k !== "card") visit(v, 0);
  return out.filter(Boolean);
}

/** "[[Folder/Page|Shown]]" -> "Shown", "[[Folder/Page]]" -> "Page". Other text is returned as it is. */
export function linkLabel(value: string): string {
  return value.replace(LINK_RE, (_w, _b, inner: string) => {
    const pipe = inner.indexOf("|");
    if (pipe >= 0) return inner.slice(pipe + 1);
    const t = inner.split("#")[0];
    return t.slice(t.lastIndexOf("/") + 1);
  });
}

/** The single page a field value links to, if it is exactly one [[link]]. */
export function singleLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^\s*\[\[([^[\]\n]+?)\]\]\s*$/.exec(value);
  return m ? linkTarget(m[1]) : null;
}

// #tags in text (Obsidian style): letters, digits, _ - and / for nested tags; not only digits.
const TAG_RE = /(^|[\s(,;])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;
export function extractTags(text: string): string[] {
  const out: string[] = [];
  // Ignore code: `inline` and fenced blocks.
  const clean = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  for (const m of clean.matchAll(TAG_RE)) if (!/^\d+$/.test(m[2])) out.push(m[2].replace(/\/$/, ""));
  return out;
}

/** Tags from a "tags" property: a list, or a comma or space separated string. "#" is optional. */
export function propertyTags(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s]+/) : [];
  return list.filter((t): t is string => typeof t === "string").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
}

export { TAG_RE };
