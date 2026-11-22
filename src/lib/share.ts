// "Share with players": one self-contained HTML file with the pages players may see. Secret pages, secret
// boxes, secret cards and [!secret] callouts are left out of the file itself (not just hidden), as are locked
// pages, templates and the trash. Pictures are put inside the file, links between pages still work.
import { Marked } from "marked";

// Own instance (the editor adds its own syntax to the shared one). ==text== is highlighted, as in Obsidian.
const marked = new Marked({ gfm: true });
import { parseCanvas } from "./canvas";
import { frontData, splitFrontmatter } from "./frontmatter";
import type { NotebookIndex } from "./index";
import type { CardType } from "./kits";
import { LINK_RE, linkTarget } from "./links";
import { parseMap } from "./map";
import { type Store, dirname, ext } from "./storage";

export interface ShareOptions {
  title: string;
  /** Only pages inside this folder ("" = whole notebook). */
  folder: string;
  templatesFolder: string;
  cardTypes: CardType[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const HIDDEN_KEYS = new Set(["card", "secret", "tags", "lararbordet"]);

/** Removes > [!secret] callouts from Markdown. */
export function stripSecrets(md: string): string {
  const out: string[] = [];
  let inSecret = false;
  for (const line of md.split("\n")) {
    if (/^\s*>\s*\[!secret\]/i.test(line)) {
      inSecret = true;
      continue;
    }
    if (inSecret && /^\s*>/.test(line)) continue;
    inSecret = false;
    out.push(line);
  }
  return out.join("\n");
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", bmp: "image/bmp" };

export async function buildShareHtml(store: Store, index: NotebookIndex, o: ShareOptions): Promise<{ html: string; pages: number; left: number }> {
  const inFolder = (p: string) => !o.folder || p === o.folder || p.startsWith(o.folder + "/");
  const all = [...index.pages.values()].filter((p) => inFolder(p.path) && !p.path.startsWith(o.templatesFolder + "/") && !p.path.startsWith("_trash/"));
  const pages = all.filter((p) => ["md", "canvas", "map"].includes(p.ext) && !p.secret).sort((a, b) => a.path.localeCompare(b.path));
  const left = all.length - pages.length;
  const ids = new Map(pages.map((p, i) => [p.path, `p${i + 1}`]));
  const images = new Map<string, string>();
  const imageData = async (src: string, from: string): Promise<string | null> => {
    const file = index.resolveFile(src, from);
    if (!file) return null;
    if (!images.has(file)) {
      try {
        const bytes = await store.readBytes(file);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        images.set(file, `data:${MIME[ext(file)] ?? "application/octet-stream"};base64,${btoa(bin)}`);
      } catch {
        return null;
      }
    }
    return images.get(file)!;
  };
  const linkHtml = (raw: string, from: string, label?: string) => {
    const target = linkTarget(raw);
    const hit = index.resolve(target, from);
    const text = esc(label ?? (raw.includes("|") ? raw.split("|").pop()! : target.split("/").pop()!.split("#")[0]));
    return hit && ids.has(hit) ? `<a href="#${ids.get(hit)}">${text}</a>` : `<span class="nolink">${text}</span>`;
  };
  /** Markdown to HTML with [[links]] and ![[pictures]] handled. */
  const mdHtml = async (md: string, from: string): Promise<string> => {
    let src = stripSecrets(md);
    const pics: Promise<[string, string | null]>[] = [];
    src.replace(LINK_RE, (m, bang: string, raw: string) => {
      if (bang) pics.push(imageData(linkTarget(raw), from).then((d) => [m, d]));
      return m;
    });
    for (const m of src.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)) pics.push(imageData(decodeURI(m[2]), from).then((d) => [m[0], d]));
    const found = new Map(await Promise.all(pics));
    src = src.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, alt: string) => (found.get(m) ? `<img alt="${esc(alt)}" src="${found.get(m)}">` : ""));
    src = src.replace(LINK_RE, (m, bang: string, raw: string) => (bang ? (found.get(m) ? `<img alt="" src="${found.get(m)}">` : "") : linkHtml(raw, from)));
    src = src.replace(/==(?!\s)([^=\n]*[^=\s])==/g, "<mark>$1</mark>");
    return marked.parse(src, { async: false, gfm: true, breaks: false }) as string;
  };
  const fieldsHtml = (data: Record<string, unknown>, from: string): string => {
    const type = o.cardTypes.find((c) => c.id === data.card);
    const rows = Object.entries(data)
      .filter(([k, v]) => !HIDDEN_KEYS.has(k) && v !== "" && v !== null && v !== false && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => {
        const label = type?.fields.find((f) => f.key === k)?.label ?? k;
        const vals = (Array.isArray(v) ? v : [v]).map((x) => (Array.isArray(x) ? `[[${x.join("")}]]` : String(x === true ? "✓" : x)));
        const shown = vals.map((s) => s.replace(LINK_RE, (_m, _b, raw: string) => linkHtml(raw, from)).replace(/^(?!<)(.*)$/, (t) => esc(t))).join(", ");
        return `<tr><th>${esc(label)}</th><td>${shown}</td></tr>`;
      });
    return `<div class="card">${type ? `<div class="card-type" style="background:${esc(type.color)}">${esc(type.name)}</div>` : ""}${rows.length ? `<table>${rows.join("")}</table>` : ""}</div>`;
  };
  const textBlock = async (text: string, from: string) => {
    const { front, body } = splitFrontmatter(text);
    const data = front ? frontData(front) : {};
    if (data.secret === true) return null;
    return (data.card ? fieldsHtml(data, from) : "") + (await mdHtml(body, from));
  };

  const sections: string[] = [];
  for (const p of pages) {
    const src = await store.readText(p.path).catch(() => "");
    let inner = "";
    if (p.ext === "md") inner = (await textBlock(src, p.path)) ?? "";
    else if (p.ext === "canvas") {
      try {
        const doc = parseCanvas(src);
        const nodes = doc.nodes.filter((n) => n.secret !== true);
        const minX = Math.min(0, ...nodes.map((n) => n.x));
        const minY = Math.min(0, ...nodes.map((n) => n.y));
        const boxes: string[] = [];
        for (const n of nodes) {
          const style = `left:${n.x - minX}px;top:${n.y - minY}px;width:${n.width}px;${n.type === "group" || n.fixedHeight ? `height:${n.height}px;` : ""}`;
          if (n.type === "text" && typeof n.text === "string") {
            const html = await textBlock(n.text, p.path);
            if (html !== null) boxes.push(`<div class="box" style="${style}">${html}</div>`);
          } else if (n.type === "file" && typeof n.file === "string") {
            const d = await imageData(n.file, p.path);
            if (d) boxes.push(`<div class="box pic" style="${style}"><img alt="" src="${d}"></div>`);
            else if (/\.(md|canvas|map)$/.test(n.file)) boxes.push(`<div class="box" style="${style}">${linkHtml(n.file.replace(/\.(md|canvas|map)$/, ""), p.path)}</div>`);
          } else if (n.type === "link" && typeof n.url === "string" && /^https?:/.test(n.url)) {
            boxes.push(`<div class="box" style="${style}"><a href="${esc(n.url)}" rel="noopener">${esc(n.url)}</a></div>`);
          } else if (n.type === "group") {
            boxes.push(`<div class="box group" style="${style}"><span>${esc(String(n.label ?? ""))}</span></div>`);
          }
        }
        const h = Math.max(200, ...nodes.map((n) => n.y - minY + (n.height || 100) + 40));
        inner = `<div class="canvas" style="height:${h}px">${boxes.join("")}</div>`;
      } catch {
        inner = "";
      }
    } else if (p.ext === "map") {
      try {
        const m = parseMap(src);
        const pic = m.image ? await imageData(m.image, p.path) : null;
        const pins = m.pins
          .filter((pin) => {
            const target = pin.target ? linkTarget(pin.target.replace(/^\[\[|\]\]$/g, "")) : "";
            const hit = target ? index.resolve(target, p.path) : null;
            return !hit || ids.has(hit); // pins to secret pages are left out
          })
          .map((pin) => {
            const target = pin.target ? pin.target.replace(/^\[\[|\]\]$/g, "") : "";
            const label = pin.label || target.split("/").pop() || "";
            const inner = target ? linkHtml(target, p.path, label) : esc(label);
            return `<div class="pin" style="left:${pin.x * 100}%;top:${pin.y * 100}%;--c:${esc(pin.color ?? "#c53030")}"><i></i>${inner}</div>`;
          });
        inner = pic ? `<div class="map"><img alt="" src="${pic}">${pins.join("")}</div>` : "";
      } catch {
        inner = "";
      }
    }
    sections.push(`<section id="${ids.get(p.path)}" data-title="${esc(p.title.toLowerCase())}"><h1>${esc(p.title)}</h1>${inner}</section>`);
  }
  const groups = new Map<string, typeof pages>();
  for (const p of pages) groups.set(dirname(p.path), [...(groups.get(dirname(p.path)) ?? []), p]);
  const nav = [...groups]
    .map(([dir, list]) => `<details open><summary>${esc(dir.split("/").pop() || o.title)}</summary>${list.map((p) => `<a href="#${ids.get(p.path)}" data-q="${esc(p.title.toLowerCase())}">${esc(p.title)}</a>`).join("")}</details>`)
    .join("");
  const first = pages[0] ? ids.get(pages[0].path) : "";
  const html = `<!DOCTYPE html>
<html lang="${(typeof document !== "undefined" && document.documentElement.lang) || "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,"Segoe UI",sans-serif;color:#2a2622;background:#f4efe6;display:grid;grid-template-columns:260px 1fr;min-height:100vh}
nav{background:#e8dfcf;border-right:1px solid #d3c6ae;padding:14px;position:sticky;top:0;height:100vh;overflow:auto}
nav h2{font-size:17px;margin:0 0 10px}nav input{width:100%;padding:6px 8px;border:1px solid #c9b994;border-radius:6px;margin-bottom:10px;background:#fffaf0}
nav summary{font-weight:600;cursor:pointer;margin-top:8px}nav a{display:block;padding:3px 8px;color:inherit;text-decoration:none;border-radius:5px}nav a:hover,nav a.on{background:#d7c9ad}
main{padding:24px 34px;overflow:auto}section{display:none}section.on{display:block}h1{margin-top:0}
a{color:#8b3a1e}.nolink{color:#7c6b55}img{max-width:100%}
.card{border:1px solid #d3c6ae;border-radius:8px;background:#fffaf0;margin:0 0 12px;overflow:hidden}.card-type{color:#fff;font-size:12px;font-weight:600;padding:3px 10px}
.card table{border-collapse:collapse;width:100%}.card th{text-align:left;font-weight:600;padding:3px 10px;width:35%;color:#5a4d3c}.card td{padding:3px 10px}
table{border-collapse:collapse}td,th{border-top:1px solid #e5dccb}
.canvas{position:relative;min-width:100%}.box{position:absolute;background:#fffaf0;border:1px solid #d3c6ae;border-radius:8px;padding:8px 12px;overflow:hidden}
.box.pic{padding:0;background:none;border:0}.box.group{background:rgba(139,58,30,.05);border-style:dashed}.box.group span{font-weight:600;color:#7c6b55}
.map{position:relative;display:inline-block}.map img{display:block}.pin{position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font-size:13px;font-weight:600;background:rgba(255,250,240,.9);padding:1px 6px;border-radius:9px;border:1px solid var(--c)}
.pin i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c);margin-right:4px}
footer{color:#7c6b55;font-size:12px;margin-top:40px}
@media print{body{display:block}nav{display:none}section{display:block;page-break-after:always}.canvas{height:auto!important}.box{position:static;margin:0 0 10px;width:auto!important}}
@media (max-width:700px){body{grid-template-columns:1fr}nav{position:static;height:auto}}
</style></head><body>
<nav><h2>${esc(o.title)}</h2><input type="search" placeholder="🔍" oninput="f(this.value)">${nav}</nav>
<main>${sections.join("\n")}<footer>Made with DorkyNotes · ${new Date().toISOString().slice(0, 10)}</footer></main>
<script>
function show(){var id=(location.hash||"#${first}").slice(1);document.querySelectorAll("section").forEach(function(s){s.classList.toggle("on",s.id===id)});document.querySelectorAll("nav a").forEach(function(a){a.classList.toggle("on",a.getAttribute("href")==="#"+id)});scrollTo(0,0)}
function f(q){q=q.toLowerCase();document.querySelectorAll("nav a").forEach(function(a){a.style.display=a.dataset.q.indexOf(q)>=0?"":"none"})}
addEventListener("hashchange",show);show();
</script></body></html>`;
  return { html, pages: pages.length, left };
}
