// Page history: snapshots of a page kept in .notesapp/history/<page path>/<time>.<ext>.
// One snapshot per few minutes of editing (the newest is refreshed until the window passes), at most KEEP per page.
// Locked pages never get history, so nothing readable is left behind.
import { type Store, ext, join } from "./storage";

const ROOT = ".notesapp/history";
const WINDOW = 5 * 60 * 1000;
export const KEEP = 50;

export const historyDir = (path: string) => join(ROOT, encodeURIComponent(path));

export interface Version {
  file: string;
  time: number;
}

export async function listVersions(store: Store, path: string): Promise<Version[]> {
  const items = await store.list(historyDir(path)).catch(() => []);
  return items
    .filter((e) => !e.isDir && /^\d+\./.test(e.name))
    .map((e) => ({ file: join(historyDir(path), e.name), time: Number(e.name.split(".")[0]) }))
    .sort((a, b) => b.time - a.time);
}

const last = new Map<string, { time: number; content: string }>();

/** Called after each save. Cheap: skips unchanged content and writes at most one file per save. */
export async function snapshot(store: Store, path: string, content: string, now = Date.now()): Promise<void> {
  const e = ext(path);
  if (e === "locked" || !content) return;
  let prev = last.get(path);
  if (!prev) {
    const v = (await listVersions(store, path))[0];
    prev = v ? { time: v.time, content: await store.readText(v.file).catch(() => "") } : undefined;
  }
  if (prev && prev.content === content) return;
  const dir = historyDir(path);
  await store.mkdir(dir);
  if (prev && now - prev.time < WINDOW) {
    // Still the same stretch of editing: refresh the newest snapshot instead of adding one.
    await store.writeText(join(dir, `${prev.time}.${e}`), content);
    last.set(path, { time: prev.time, content });
    return;
  }
  await store.writeText(join(dir, `${now}.${e}`), content);
  last.set(path, { time: now, content });
  const all = await listVersions(store, path);
  for (const old of all.slice(KEEP)) await store.remove(old.file).catch(() => {});
}

/** Removes every snapshot of a page (used when a page is locked). */
export async function forget(store: Store, path: string): Promise<number> {
  last.delete(path);
  const all = await listVersions(store, path);
  for (const v of all) await store.remove(v.file).catch(() => {});
  return all.length;
}
