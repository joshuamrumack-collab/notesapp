// Search, links, backlinks and cards for one notebook. Built by reading the files; it is only a cache.
import MiniSearch from "minisearch";
import { parseCanvas } from "./canvas";
import { type Data, frontData, splitFrontmatter } from "./frontmatter";
import { extractLinks, linkTarget, propertyLinks } from "./links";
import { type Store, basename, dirname, ext, stem, walk } from "./storage";

export interface PageInfo {
  path: string;
  title: string;
  ext: string;
  text: string;
  links: string[];
  data: Data;
  secret: boolean;
}

export interface CardRef {
  path: string;
  nodeId?: string;
  type: string;
  data: Data;
  title: string;
}

export const PAGE_EXTS = ["md", "canvas", "locked"];
const lower = (s: string) => s.toLowerCase();
const noExt = (p: string) => p.replace(/\.(md|canvas|locked)$/i, "");

function cardTitle(data: Data, fallback: string): string {
  for (const k of ["name", "title", "pupil"]) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return fallback;
}

function firstHeading(text: string): string {
  const m = /^#{1,6}\s+(.+)$/m.exec(text);
  return m ? m[1].trim() : "";
}

export function parsePage(path: string, content: string, templatesFolder: string): { info: PageInfo; cards: CardRef[] } {
  const e = ext(path);
  const title = stem(path);
  const inTemplates = path === templatesFolder || path.startsWith(templatesFolder + "/");
  const info: PageInfo = { path, title, ext: e, text: "", links: [], data: {}, secret: false };
  const cards: CardRef[] = [];
  if (e === "md") {
    const { front, body } = splitFrontmatter(content);
    info.data = frontData(front);
    info.text = body;
    info.links = [...extractLinks(body), ...propertyLinks(info.data)];
    info.secret = info.data.secret === true;
    const type = info.data.card;
    if (typeof type === "string" && !inTemplates) cards.push({ path, type, data: info.data, title: cardTitle(info.data, title) });
  } else if (e === "canvas") {
    try {
      const doc = parseCanvas(content);
      const texts: string[] = [];
      const propLinks: string[] = [];
      for (const n of doc.nodes) {
        if (n.type !== "text" || typeof n.text !== "string") continue;
        const { front, body } = splitFrontmatter(n.text);
        const data = frontData(front);
        propLinks.push(...propertyLinks(data));
        texts.push(Object.values(data).filter((v) => typeof v === "string" || typeof v === "number").join(" ") + "\n" + body);
        if (typeof data.card === "string" && !inTemplates) {
          cards.push({ path, nodeId: n.id, type: data.card, data, title: cardTitle(data, firstHeading(body) || title) });
        }
      }
      info.text = texts.join("\n\n");
      info.links = [...extractLinks(info.text), ...propLinks];
    } catch {
      /* broken canvas: index the title only */
    }
  }
  return { info, cards };
}

export class NotebookIndex {
  files: string[] = [];
  pages = new Map<string, PageInfo>();
  cards = new Map<string, CardRef[]>();
  private ms: MiniSearch;
  constructor(public templatesFolder = "_templates") {
    this.ms = new MiniSearch({
      idField: "path",
      fields: ["title", "text"],
      storeFields: ["title"],
      searchOptions: { prefix: true, fuzzy: 0.15, boost: { title: 3 }, combineWith: "AND" },
    });
  }

  static async build(store: Store, templatesFolder = "_templates"): Promise<NotebookIndex> {
    const idx = new NotebookIndex(templatesFolder);
    idx.files = await walk(store);
    const pages = idx.files.filter((f) => PAGE_EXTS.includes(ext(f)));
    const batch = 16;
    for (let i = 0; i < pages.length; i += batch) {
      await Promise.all(
        pages.slice(i, i + batch).map(async (p) => {
          let content = "";
          if (ext(p) !== "locked") {
            try {
              content = await store.readText(p);
            } catch {
              /* unreadable: title only */
            }
          }
          idx.setPage(p, content);
        }),
      );
    }
    return idx;
  }

  setPage(path: string, content: string) {
    const { info, cards } = parsePage(path, content, this.templatesFolder);
    if (this.ms.has(path)) this.ms.discard(path);
    this.ms.add({ path, title: info.title, text: info.text });
    this.pages.set(path, info);
    this.cards.set(path, cards);
    if (!this.files.includes(path)) this.files.push(path);
  }

  addFile(path: string) {
    if (!this.files.includes(path)) this.files.push(path);
  }

  remove(path: string) {
    if (this.ms.has(path)) this.ms.discard(path);
    this.pages.delete(path);
    this.cards.delete(path);
    this.files = this.files.filter((f) => f !== path);
  }

  /** Find the page a [[link]] points to, preferring pages in the same folder as `from`. */
  resolve(raw: string, from = ""): string | null {
    const t = lower(noExt(linkTarget(raw)));
    if (!t) return null;
    const all = [...this.pages.keys()];
    if (t.includes("/")) {
      const hit = all.find((p) => lower(noExt(p)) === t) ?? all.find((p) => lower(noExt(p)).endsWith("/" + t));
      return hit ?? null;
    }
    const matches = all.filter((p) => lower(stem(p)) === t);
    if (!matches.length) return null;
    const here = dirname(from);
    return matches.find((p) => dirname(p) === here) ?? matches.sort((a, b) => a.length - b.length)[0];
  }

  /** Find an attachment by name or path, like Obsidian does. */
  resolveFile(raw: string, from = ""): string | null {
    let t = raw.split("|")[0].trim();
    try {
      t = decodeURIComponent(t);
    } catch {
      /* keep as is */
    }
    t = t.replace(/^\.\//, "");
    const l = lower(t);
    const exact = this.files.find((f) => lower(f) === l);
    if (exact) return exact;
    const rel = dirname(from) ? lower(dirname(from) + "/" + t) : l;
    const relHit = this.files.find((f) => lower(f) === rel);
    if (relHit) return relHit;
    const name = lower(basename(t));
    const hits = this.files.filter((f) => lower(basename(f)) === name);
    return hits.sort((a, b) => a.length - b.length)[0] ?? null;
  }

  backlinks(path: string): string[] {
    const out: string[] = [];
    for (const p of this.pages.values()) {
      if (p.path === path) continue;
      if (p.links.some((l) => this.resolve(l, p.path) === path)) out.push(p.path);
    }
    return out.sort();
  }

  /** The text to put inside [[ ]] for a page: its name, or its folder path if the name is not unique. */
  linkTo(path: string): string {
    const name = stem(path);
    return this.resolve(name) === path ? name : noExt(path);
  }

  titles(): string[] {
    return [...this.pages.values()].map((p) => p.title);
  }

  /** Pages whose title matches, best first. */
  findTitles(query: string, limit = 30): PageInfo[] {
    const q = lower(query.trim());
    const all = [...this.pages.values()];
    if (!q) return all.sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit);
    const score = (p: PageInfo) => {
      const t = lower(p.title);
      if (t === q) return 0;
      if (t.startsWith(q)) return 1;
      if (t.includes(q)) return 2;
      if (lower(p.path).includes(q)) return 3;
      let i = 0;
      for (const c of t) if (c === q[i]) i++;
      return i === q.length ? 4 : 9;
    };
    return all
      .map((p) => ({ p, s: score(p) }))
      .filter((x) => x.s < 9)
      .sort((a, b) => a.s - b.s || a.p.title.length - b.p.title.length)
      .slice(0, limit)
      .map((x) => x.p);
  }

  search(query: string, limit = 50): { path: string; title: string; snippet: string }[] {
    if (!query.trim()) return [];
    return this.ms
      .search(query)
      .slice(0, limit)
      .map((r) => {
        const page = this.pages.get(r.id as string);
        return { path: r.id as string, title: (r.title as string) ?? "", snippet: page ? snippet(page.text, r.terms) : "" };
      });
  }

  allCards(): CardRef[] {
    return [...this.cards.values()].flat();
  }
}

function snippet(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, " ");
  const l = lower(flat);
  let at = -1;
  for (const t of terms) {
    at = l.indexOf(lower(t));
    if (at >= 0) break;
  }
  if (at < 0) return flat.slice(0, 120);
  const start = Math.max(0, at - 50);
  return (start > 0 ? "…" : "") + flat.slice(start, at + 90) + (at + 90 < flat.length ? "…" : "");
}
