// Notebook settings (.notesapp/notebook.json), applying kits, templates and kit export.
import { type CardType, type Kit, type ToolId, type ViewDef, builtInKits } from "./kits";
import { type Store, ext, freeName, join, stem, walk } from "./storage";

export interface NotebookConfig {
  version: 1;
  kit?: string;
  kitName?: string;
  cardTypes: CardType[];
  views: ViewDef[];
  tools: ToolId[];
  templatesFolder: string;
}

const CONFIG = ".notesapp/notebook.json";

export const emptyConfig = (): NotebookConfig => ({ version: 1, cardTypes: [], views: [], tools: [], templatesFolder: "_templates" });

export async function loadConfig(store: Store): Promise<{ config: NotebookConfig; exists: boolean }> {
  try {
    const raw = JSON.parse(await store.readText(CONFIG)) as Partial<NotebookConfig>;
    return { config: { ...emptyConfig(), ...raw, version: 1 }, exists: true };
  } catch {
    const config = emptyConfig();
    // An Obsidian vault may name its own templates folder.
    try {
      const t = JSON.parse(await store.readText(".obsidian/templates.json")) as { folder?: string };
      if (t.folder) config.templatesFolder = t.folder.replace(/^\/+|\/+$/g, "");
    } catch {
      /* not an Obsidian vault, or no templates set */
    }
    return { config, exists: false };
  }
}

export async function saveConfig(store: Store, config: NotebookConfig) {
  await store.writeText(CONFIG, JSON.stringify(config, null, "\t") + "\n");
}

export async function isEmptyFolder(store: Store): Promise<boolean> {
  return (await store.list("")).filter((e) => !e.name.startsWith(".")).length === 0;
}

/**
 * Add a kit to a notebook. Existing card types, views and templates with the same name are kept,
 * existing sections and pages are never touched.
 */
export async function applyKit(store: Store, kit: Kit, base: NotebookConfig, opts: { sections: boolean; startPage: boolean }): Promise<NotebookConfig> {
  const have = new Set(base.cardTypes.map((c) => c.id));
  const haveViews = new Set(base.views.map((v) => v.id));
  const config: NotebookConfig = {
    ...base,
    kit: kit.id,
    kitName: kit.name,
    // Card types you already have keep your changes; fields the kit has added since are appended.
    cardTypes: [
      ...base.cardTypes.map((c) => {
        const k = kit.cardTypes.find((x) => x.id === c.id);
        if (!k) return c;
        const keys = new Set(c.fields.map((f) => f.key));
        return { ...c, fields: [...c.fields, ...k.fields.filter((f) => !keys.has(f.key))] };
      }),
      ...kit.cardTypes.filter((c) => !have.has(c.id)),
    ],
    views: [...base.views, ...kit.views.filter((v) => !haveViews.has(v.id))],
    tools: [...new Set([...base.tools, ...kit.tools])],
  };
  if (opts.sections) for (const s of kit.sections) if (!(await store.exists(s))) await store.mkdir(s);
  for (const t of kit.templates) {
    const path = join(config.templatesFolder, `${t.name}.${t.ext}`);
    if (!(await store.exists(path))) await store.writeText(path, t.content);
  }
  if (opts.startPage && kit.startPage && !(await store.exists("Start here.canvas"))) await store.writeText("Start here.canvas", kit.startPage);
  await saveConfig(store, config);
  return config;
}

export async function listTemplates(store: Store, folder: string): Promise<string[]> {
  if (!(await store.exists(folder))) return [];
  return (await walk(store, folder)).filter((p) => ["md", "canvas"].includes(ext(p))).sort();
}

const pad = (n: number) => String(n).padStart(2, "0");
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Fill {{title}}, {{date}} and {{time}} (Obsidian's core template variables). */
export function fillTemplate(content: string, title: string, now = new Date()): string {
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const filled = content
    .replace(/\{\{\s*title\s*\}\}/g, title)
    .replace(/\{\{\s*date(?::[^}]*)?\s*\}\}/g, today(now))
    .replace(/\{\{\s*time(?::[^}]*)?\s*\}\}/g, time);
  return filled;
}

/** Package this notebook's card types, views, tools, sections and templates as a shareable kit file. */
export async function exportKit(store: Store, config: NotebookConfig, name: string, description: string): Promise<{ path: string; kit: Kit }> {
  const templates = [];
  for (const p of await listTemplates(store, config.templatesFolder)) {
    templates.push({ name: stem(p), ext: ext(p) as "md" | "canvas", content: await store.readText(p) });
  }
  const sections = (await store.list(""))
    .filter((e) => e.isDir && !e.name.startsWith(".") && !e.name.startsWith("_") && e.name !== config.templatesFolder)
    .map((e) => e.name);
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kit";
  const kit: Kit = { format: "notesapp-kit", id, name, description, sections, cardTypes: config.cardTypes, views: config.views, templates, tools: config.tools };
  const file = await freeName(store, "", name.replace(/[\\/:*?"<>|]/g, "") || "kit", "kit.json");
  await store.writeText(file, JSON.stringify(kit, null, "\t") + "\n");
  return { path: file, kit };
}

// Kits the user loaded or saved, remembered on this computer.
const SAVED = "notesapp.savedKits";
export function savedKits(): Kit[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED) ?? "[]") as Kit[];
  } catch {
    return [];
  }
}
export function rememberKit(kit: Kit) {
  const rest = savedKits().filter((k) => k.id !== kit.id && !builtInKits.some((b) => b.id === kit.id));
  try {
    localStorage.setItem(SAVED, JSON.stringify([...rest, kit]));
  } catch {
    /* storage unavailable */
  }
}
