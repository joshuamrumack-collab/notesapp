// All file access goes through this module. Paths are relative to the notebook root, "/" separated.
export interface Entry {
  name: string;
  isDir: boolean;
}

export interface Store {
  rootName: string;
  list(dir: string): Promise<Entry[]>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Delete one file. Only used where a copy must not stay behind (locking a page). */
  remove(path: string): Promise<void>;
  /** Absolute folder path on disk, when known (desktop app). */
  rootPath?: string;
}

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const canPickFolderInBrowser = typeof window !== "undefined" && "showDirectoryPicker" in window;

export const join = (...parts: string[]) => parts.filter(Boolean).join("/");
export const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
export const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);
export const stem = (p: string) => basename(p).replace(/\.[^.]+$/, "");
export const ext = (p: string) => (/\.([^./]+)$/.exec(p)?.[1] ?? "").toLowerCase();

/** Find a free name like "Untitled 2.canvas" in dir. */
export async function freeName(store: Store, dir: string, base: string, extension: string): Promise<string> {
  const suffix = extension ? "." + extension : "";
  for (let i = 1; ; i++) {
    const name = (i === 1 ? base : `${base} ${i}`) + suffix;
    if (!(await store.exists(join(dir, name)))) return name;
  }
}

// ---------- Desktop (Tauri) ----------
async function tauriStore(root: string): Promise<Store> {
  const { invoke } = await import("@tauri-apps/api/core");
  const sep = root.includes("\\") ? "\\" : "/";
  const abs = (p: string) => (p ? root + sep + p.split("/").join(sep) : root);
  return {
    rootName: root.split(/[\\/]/).filter(Boolean).pop() ?? root,
    rootPath: root,
    list: async (dir) =>
      (await invoke<{ name: string; is_dir: boolean }[]>("list_dir", { path: abs(dir) })).map((e) => ({
        name: e.name,
        isDir: e.is_dir,
      })),
    readText: (p) => invoke<string>("read_text", { path: abs(p) }),
    writeText: (p, text) => invoke("write_text", { path: abs(p), text }),
    readBytes: async (p) => new Uint8Array(await invoke<ArrayBuffer>("read_bytes", { path: abs(p) })),
    writeBytes: (p, data) => invoke("write_bytes", { path: abs(p), data: Array.from(data) }),
    mkdir: (p) => invoke("make_dir", { path: abs(p) }),
    move: (from, to) => invoke("move_path", { from: abs(from), to: abs(to) }),
    exists: (p) => invoke<boolean>("path_exists", { path: abs(p) }),
    remove: (p) => invoke("remove_file", { path: abs(p) }),
  };
}

// ---------- Browser (File System Access API, Chrome/Edge) ----------
function browserStore(root: FileSystemDirectoryHandle): Store {
  const dirHandle = async (dir: string, create = false) => {
    let h = root;
    for (const part of dir.split("/").filter(Boolean)) h = await h.getDirectoryHandle(part, { create });
    return h;
  };
  const fileHandle = async (p: string, create = false) =>
    (await dirHandle(dirname(p), create)).getFileHandle(basename(p), { create });
  const write = async (p: string, data: string | Uint8Array) => {
    const w = await (await fileHandle(p, true)).createWritable();
    await w.write(data as FileSystemWriteChunkType);
    await w.close();
  };
  const exists = async (p: string) => {
    if (!p) return true;
    try {
      const d = await dirHandle(dirname(p));
      try {
        await d.getFileHandle(basename(p));
      } catch {
        await d.getDirectoryHandle(basename(p));
      }
      return true;
    } catch {
      return false;
    }
  };
  const store: Store = {
    rootName: root.name,
    list: async (dir) => {
      const out: Entry[] = [];
      for await (const [name, h] of (await dirHandle(dir)).entries()) out.push({ name, isDir: h.kind === "directory" });
      return out;
    },
    readText: async (p) => (await (await fileHandle(p)).getFile()).text(),
    writeText: write,
    readBytes: async (p) => new Uint8Array(await (await (await fileHandle(p)).getFile()).arrayBuffer()),
    writeBytes: write,
    mkdir: async (p) => void (await dirHandle(p, true)),
    exists,
    remove: async (p) => (await dirHandle(dirname(p))).removeEntry(basename(p)),
    move: async (from, to) => {
      if (await exists(to)) throw new Error(`${to} already exists`);
      const parent = await dirHandle(dirname(from));
      let isDir = false;
      try {
        await parent.getFileHandle(basename(from));
      } catch {
        isDir = true;
      }
      const copy = async (a: string, b: string, dir: boolean) => {
        if (!dir) return store.writeBytes(b, await store.readBytes(a));
        await store.mkdir(b);
        for (const e of await store.list(a)) await copy(join(a, e.name), join(b, e.name), e.isDir);
      };
      await copy(from, to, isDir);
      await parent.removeEntry(basename(from), { recursive: true });
    },
  };
  return store;
}

// ---------- In memory (demo and tests) ----------
export function memoryStore(rootName = "Demo notebook", files: Record<string, string> = {}): Store {
  const data = new Map<string, Uint8Array>();
  const dirs = new Set<string>([""]);
  const enc = new TextEncoder();
  const addDirs = (p: string) => {
    for (let d = dirname(p); d; d = dirname(d)) dirs.add(d);
  };
  const put = (p: string, bytes: Uint8Array) => {
    data.set(p, bytes);
    addDirs(p);
  };
  for (const [p, text] of Object.entries(files)) put(p, enc.encode(text));
  const get = (p: string) => {
    const b = data.get(p);
    if (!b) throw new Error(`${p} not found`);
    return b;
  };
  return {
    rootName,
    list: async (dir) => {
      const out = new Map<string, boolean>();
      const prefix = dir ? dir + "/" : "";
      for (const d of dirs) if (d && dirname(d) === dir) out.set(basename(d), true);
      for (const p of data.keys()) if (p.startsWith(prefix) && !p.slice(prefix.length).includes("/")) out.set(basename(p), false);
      return [...out].map(([name, isDir]) => ({ name, isDir }));
    },
    readText: async (p) => new TextDecoder().decode(get(p)),
    writeText: async (p, text) => put(p, enc.encode(text)),
    readBytes: async (p) => get(p),
    writeBytes: async (p, bytes) => put(p, bytes),
    mkdir: async (p) => {
      dirs.add(p);
      addDirs(p + "/x");
    },
    exists: async (p) => data.has(p) || dirs.has(p),
    remove: async (p) => {
      if (!data.delete(p)) throw new Error(`${p} not found`);
    },
    move: async (from, to) => {
      if (data.has(to) || dirs.has(to)) throw new Error(`${to} already exists`);
      if (data.has(from)) {
        put(to, get(from));
        data.delete(from);
        return;
      }
      for (const p of [...data.keys()]) {
        if (p.startsWith(from + "/")) {
          put(to + p.slice(from.length), get(p));
          data.delete(p);
        }
      }
      for (const d of [...dirs]) {
        if (d === from || d.startsWith(from + "/")) {
          dirs.delete(d);
          dirs.add(to + d.slice(from.length));
        }
      }
    },
  };
}

/** Every file in the notebook, skipping hidden folders and the trash. */
export async function walk(store: Store, dir = "", skip: Set<string> = new Set(["_trash", "node_modules"])): Promise<string[]> {
  const out: string[] = [];
  let items: Entry[] = [];
  try {
    items = await store.list(dir);
  } catch {
    return out;
  }
  for (const e of items) {
    if (e.name.startsWith(".") || skip.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDir) out.push(...(await walk(store, p, skip)));
    else out.push(p);
  }
  return out;
}

export async function openFolderPath(path: string): Promise<Store> {
  return tauriStore(path);
}

/** Ask the user for a notebook folder. Returns null if they cancel. */
export async function pickNotebook(): Promise<Store | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, title: "Open a folder as a notebook" });
    return typeof picked === "string" ? tauriStore(picked) : null;
  }
  if (canPickFolderInBrowser) {
    try {
      // @ts-expect-error showDirectoryPicker is not in every TS lib version
      return browserStore(await window.showDirectoryPicker({ mode: "readwrite" }));
    } catch {
      return null;
    }
  }
  return null;
}
