// Converts the XML that the OneNote desktop app returns (GetHierarchy / GetPageContent, 2013 schema)
// into notebook folders and canvas pages. Element names are matched without their "one:" prefix.
import { type CanvasNode, newId } from "./canvas";

export interface OnPage {
  id: string;
  name: string;
  level: number;
}
export interface OnSection {
  kind: "section";
  id: string;
  name: string;
  locked: boolean;
  pages: OnPage[];
}
export interface OnGroup {
  kind: "group";
  id: string;
  name: string;
  children: (OnSection | OnGroup)[];
}
export interface OnNotebook {
  id: string;
  name: string;
  children: (OnSection | OnGroup)[];
}

const kids = (el: Element, name?: string) => Array.from(el.children).filter((c) => !name || c.localName === name);
const kid = (el: Element, name: string) => kids(el, name)[0] as Element | undefined;
const attr = (el: Element, name: string) => el.getAttribute(name) ?? "";
const truthy = (el: Element, name: string) => attr(el, name) === "true";

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml.replace(/^﻿/, ""), "text/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("OneNote returned XML that could not be read.");
  return doc;
}

function readContainer(el: Element): (OnSection | OnGroup)[] {
  const out: (OnSection | OnGroup)[] = [];
  for (const c of kids(el)) {
    if (c.localName === "Section" && !truthy(c, "isInRecycleBin")) {
      out.push({
        kind: "section",
        id: attr(c, "ID"),
        name: attr(c, "name"),
        locked: truthy(c, "locked") || truthy(c, "encrypted"),
        pages: kids(c, "Page")
          .filter((p) => !truthy(p, "isInRecycleBin") && !truthy(p, "isDeletedPages"))
          .map((p) => ({ id: attr(p, "ID"), name: attr(p, "name") || "Untitled", level: Math.max(1, Number(attr(p, "pageLevel")) || 1) })),
      });
    } else if (c.localName === "SectionGroup" && !truthy(c, "isRecycleBin")) {
      out.push({ kind: "group", id: attr(c, "ID"), name: attr(c, "name"), children: readContainer(c) });
    }
  }
  return out;
}

export function parseHierarchy(xml: string): OnNotebook[] {
  const doc = parseXml(xml);
  return Array.from(doc.getElementsByTagNameNS("*", "Notebook")).map((nb) => ({
    id: attr(nb, "ID"),
    name: attr(nb, "nickname") || attr(nb, "name") || "Notebook",
    children: readContainer(nb),
  }));
}

export function countPages(items: (OnSection | OnGroup)[]): number {
  return items.reduce((n, it) => n + (it.kind === "section" ? it.pages.length : countPages(it.children)), 0);
}

// ---------- page content ----------

export interface ConvertedPage {
  title: string;
  nodes: CanvasNode[];
  /** Files to write. The page refers to them as @@ATT<n>@@ until they are given real names. */
  attachments: { key: string; ext: string; data: Uint8Array }[];
  skipped: string[];
}

const PT_TO_PX = 96 / 72;

interface Ctx {
  styles: Map<string, string>;
  todoTags: Set<string>;
  attachments: ConvertedPage["attachments"];
  skipped: Map<string, number>;
}

const skip = (ctx: Ctx, what: string) => ctx.skipped.set(what, (ctx.skipped.get(what) ?? 0) + 1);

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
}

function addImage(ctx: Ctx, img: Element): string | null {
  const data = kid(img, "Data");
  if (!data?.textContent) {
    skip(ctx, "image without data");
    return null;
  }
  const fmt = (attr(img, "format") || "png").toLowerCase().replace("jpeg", "jpg");
  const key = `@@ATT${ctx.attachments.length}@@`;
  ctx.attachments.push({ key, ext: /^[a-z0-9]{2,5}$/.test(fmt) ? fmt : "png", data: base64ToBytes(data.textContent) });
  return key;
}

/** OneNote keeps formatted text as small HTML fragments inside <one:T>. */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? "").replace(/ /g, " ").replace(/([*_`[\]])/g, "\\$1");
    if (n.nodeType !== Node.ELEMENT_NODE) return "";
    const el = n as HTMLElement;
    const inner = Array.from(el.childNodes).map(walk).join("");
    const tag = el.tagName.toLowerCase();
    if (tag === "br") return "\n";
    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      const text = inner.trim() || href;
      if (/^onenote:/i.test(href)) return `[[${(el.textContent ?? text).trim()}]]`;
      return href ? `[${text}](${href})` : text;
    }
    const style = (el.getAttribute("style") ?? "").toLowerCase();
    let out = inner;
    if (!out.trim()) return out;
    const wrap = (mark: string) => {
      const lead = out.match(/^\s*/)?.[0] ?? "";
      const trail = out.match(/\s*$/)?.[0] ?? "";
      out = `${lead}${mark}${out.trim()}${mark}${trail}`;
    };
    if (tag === "b" || tag === "strong" || /font-weight:\s*(bold|[6-9]00)/.test(style)) wrap("**");
    if (tag === "i" || tag === "em" || /font-style:\s*italic/.test(style)) wrap("*");
    if (tag === "s" || tag === "strike" || /line-through/.test(style)) wrap("~~");
    return out;
  };
  return walk(doc.body).replace(/[ \t]+\n/g, "\n");
}

function oeText(ctx: Ctx, oe: Element): string {
  const parts: string[] = [];
  for (const c of kids(oe)) {
    if (c.localName === "T") parts.push(htmlToMarkdown(c.textContent ?? ""));
    else if (c.localName === "Image") {
      const key = addImage(ctx, c);
      if (key) parts.push(`![[${key}]]`);
    } else if (c.localName === "InkWord" || c.localName === "InkParagraph") skip(ctx, "handwriting");
    else if (c.localName === "InsertedFile") skip(ctx, `attached file "${attr(c, "preferredName") || "file"}"`);
    else if (c.localName === "MediaFile") skip(ctx, "audio or video recording");
    else if (c.localName === "FormulaText" || c.localName === "Math") skip(ctx, "maths");
  }
  return parts.join("");
}

function tableMd(ctx: Ctx, table: Element): string {
  const rows = kids(table, "Row").map((r) =>
    kids(r, "Cell").map((cell) => {
      const ch = kid(cell, "OEChildren");
      const text = ch ? childrenMd(ctx, ch, 0).trim() : "";
      return text.replace(/\n+/g, "<br>").replace(/\|/g, "\\|") || " ";
    }),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => "| " + Array.from({ length: width }, (_, i) => r[i] ?? " ").join(" | ") + " |";
  return [line(rows[0]), "| " + Array(width).fill("---").join(" | ") + " |", ...rows.slice(1).map(line)].join("\n");
}

function childrenMd(ctx: Ctx, children: Element, depth: number): string {
  const blocks: string[] = [];
  let listRun: string[] = [];
  const flush = () => {
    if (listRun.length) blocks.push(listRun.join("\n"));
    listRun = [];
  };
  for (const oe of kids(children, "OE")) {
    const indent = "    ".repeat(depth);
    const list = kid(oe, "List");
    const tag = kid(oe, "Tag");
    const table = kid(oe, "Table");
    const style = ctx.styles.get(attr(oe, "quickStyleIndex")) ?? "p";
    let text = oeText(ctx, oe).trim();
    if (table) {
      flush();
      blocks.push(tableMd(ctx, table));
    }
    const sub = kid(oe, "OEChildren");
    const subMd = sub ? childrenMd(ctx, sub, list || tag ? depth + 1 : depth) : "";
    let marker = "";
    if (tag && ctx.todoTags.has(attr(tag, "index"))) marker = truthy(tag, "completed") ? "- [x] " : "- [ ] ";
    else if (list) marker = kid(list, "Number") ? "1. " : "- ";
    if (marker) {
      listRun.push(indent + marker + text.replace(/\n/g, "\n" + indent + "  "));
      if (subMd) listRun.push(subMd);
      continue;
    }
    flush();
    if (text) {
      const h = /^h([1-6])$/.exec(style);
      if (h) text = "#".repeat(Number(h[1])) + " " + text.replace(/\n/g, " ");
      else if (style === "quote") text = "> " + text.replace(/\n/g, "\n> ");
      else if (style === "code") text = "```\n" + text + "\n```";
      blocks.push(indent + text);
    }
    if (subMd) blocks.push(subMd);
  }
  flush();
  return blocks.join("\n\n");
}

function box(el: Element) {
  const pos = kid(el, "Position");
  const size = kid(el, "Size");
  return {
    x: Math.max(0, Number(pos ? attr(pos, "x") : 0) * PT_TO_PX),
    y: Math.max(0, Number(pos ? attr(pos, "y") : 0) * PT_TO_PX),
    width: Number(size ? attr(size, "width") : 0) * PT_TO_PX,
    height: Number(size ? attr(size, "height") : 0) * PT_TO_PX,
  };
}

export function convertPage(xml: string): ConvertedPage {
  const doc = parseXml(xml);
  const page = doc.documentElement;
  const ctx: Ctx = { styles: new Map(), todoTags: new Set(), attachments: [], skipped: new Map() };
  for (const s of kids(page, "QuickStyleDef")) ctx.styles.set(attr(s, "index"), attr(s, "name").toLowerCase());
  for (const t of kids(page, "TagDef")) {
    const name = attr(t, "name").toLowerCase();
    if (attr(t, "symbol") === "3" || /to ?do|att göra|tehtävä|aufgabe|à faire/.test(name)) ctx.todoTags.add(attr(t, "index"));
  }
  const titleEl = kid(page, "Title");
  const title = (titleEl ? oeText(ctx, kid(titleEl, "OE") ?? titleEl) : "").replace(/\\([*_`[\]])/g, "$1").trim() || attr(page, "name") || "Untitled";
  const nodes: CanvasNode[] = [];
  // OneNote places the title at the top; content usually starts ~80pt down. Shift everything up a little.
  const shift = 70;
  for (const el of kids(page)) {
    const b = box(el);
    const x = Math.round(b.x);
    const y = Math.round(Math.max(0, b.y - shift));
    if (el.localName === "Outline") {
      const ch = kid(el, "OEChildren");
      const text = ch ? childrenMd(ctx, ch, 0).trim() : "";
      if (text) nodes.push({ id: newId(), type: "text", x, y, width: Math.round(Math.max(b.width, 280)), height: Math.round(Math.max(b.height, 40)), text });
    } else if (el.localName === "Image") {
      const key = addImage(ctx, el);
      if (key) nodes.push({ id: newId(), type: "file", file: key, x, y, width: Math.round(b.width || 400), height: Math.round(b.height || 300) });
    } else if (el.localName === "InkDrawing") skip(ctx, "drawing or handwriting");
    else if (el.localName === "InsertedFile") skip(ctx, `attached file "${attr(el, "preferredName") || "file"}"`);
    else if (el.localName === "MediaFile") skip(ctx, "audio or video recording");
  }
  const skipped = [...ctx.skipped].map(([what, n]) => (n > 1 ? `${n} × ${what}` : what));
  return { title, nodes, attachments: ctx.attachments, skipped };
}
