// Runs a OneNote import: asks the OneNote desktop app for pages and writes them into the open notebook.
import { serializeCanvas } from "./canvas";
import { type OnGroup, type OnNotebook, type OnSection, convertPage, parseHierarchy } from "./onenote";
import { type OrderMap, loadOrder, saveOrder } from "./order";
import { type Store, freeName, isTauri, join } from "./storage";

export interface OneNoteSource {
  hierarchy(): Promise<string>;
  page(id: string): Promise<string>;
}

export const desktopOneNote: OneNoteSource = {
  hierarchy: async () => (await import("@tauri-apps/api/core")).invoke<string>("onenote_hierarchy"),
  page: async (id) => (await import("@tauri-apps/api/core")).invoke<string>("onenote_page", { id }),
};

export const canImportOneNote = () => isTauri && /Windows/i.test(navigator.userAgent);

export async function loadNotebooks(src: OneNoteSource): Promise<OnNotebook[]> {
  return parseHierarchy(await src.hierarchy());
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";

export interface ImportProgress {
  done: number;
  total: number;
  current: string;
}

export interface ImportResult {
  folder: string;
  pages: number;
  report: string;
  reportPath: string;
}

/** Import the chosen sections (by ID) of one OneNote notebook into a new folder at the notebook root. */
export async function importNotebook(
  store: Store,
  src: OneNoteSource,
  nb: OnNotebook,
  chosen: Set<string>,
  onProgress: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const folder = await freeName(store, "", safe(nb.name), "");
  await store.mkdir(folder);
  const order: OrderMap = await loadOrder(store);
  const lines: string[] = [`# Imported from OneNote: ${nb.name}`, "", `Imported ${new Date().toLocaleString()}. The OneNote notebook was not changed.`, ""];
  const problems: string[] = [];
  const sections: { s: OnSection; dir: string }[] = [];
  const collect = async (items: (OnSection | OnGroup)[], dir: string) => {
    for (const it of items) {
      if (it.kind === "group") {
        const sub = join(dir, safe(it.name));
        await collect(it.children, sub);
      } else if (chosen.has(it.id)) {
        if (it.locked) problems.push(`- Section **${it.name}** is password protected. Unlock it in OneNote and import again.`);
        else sections.push({ s: it, dir: join(dir, safe(it.name)) });
      }
    }
  };
  await collect(nb.children, folder);
  const total = sections.reduce((n, x) => n + x.s.pages.length, 0);
  let done = 0;
  let pages = 0;
  for (const { s, dir } of sections) {
    await store.mkdir(dir);
    const list: { name: string; level?: number }[] = [];
    for (const p of s.pages) {
      onProgress({ done, total, current: `${s.name} › ${p.name}` });
      try {
        const conv = convertPage(await src.page(p.id));
        const title = safe(p.name || conv.title);
        const names = new Map<string, string>();
        for (const a of conv.attachments) {
          const name = await freeName(store, "_attachments", title, a.ext);
          await store.writeBytes(join("_attachments", name), a.data);
          names.set(a.key, name);
        }
        const fix = (t: string) => t.replace(/@@ATT\d+@@/g, (k) => names.get(k) ?? k);
        const nodes = conv.nodes.map((n) => ({
          ...n,
          text: n.text !== undefined ? fix(n.text) : undefined,
          file: n.file !== undefined ? join("_attachments", fix(n.file)) : undefined,
        }));
        for (const n of nodes) for (const k of ["text", "file"] as const) if (n[k] === undefined) delete n[k];
        const file = await freeName(store, dir, title, "canvas");
        await store.writeText(join(dir, file), serializeCanvas({ nodes, edges: [] }));
        list.push(p.level > 1 ? { name: file, level: p.level - 1 } : { name: file });
        pages++;
        if (conv.skipped.length) problems.push(`- [[${join(dir, file.replace(/\.canvas$/, ""))}|${p.name}]]: not converted: ${conv.skipped.join(", ")}`);
      } catch (e) {
        problems.push(`- **${s.name} › ${p.name}**: could not be imported (${e instanceof Error ? e.message : String(e)})`);
      }
      done++;
    }
    order[dir] = list;
  }
  await saveOrder(store, order);
  lines.push(`Imported **${pages}** of ${total} pages from ${sections.length} sections into the folder “${folder}”.`, "");
  lines.push(problems.length ? "## Not fully imported\n\n" + problems.join("\n") : "Everything was converted.");
  lines.push("", "Handwriting, drawings, recordings, attached files and maths are not converted yet. Box positions are kept.");
  const report = lines.join("\n") + "\n";
  const reportPath = join(folder, "Import report.md");
  await store.writeText(reportPath, report);
  onProgress({ done: total, total, current: "" });
  return { folder, pages, report, reportPath };
}
