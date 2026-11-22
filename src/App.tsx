import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { CanvasPage } from "./components/CanvasPage";
import { Backlinks, Finder } from "./components/Finder";
import { KitPicker } from "./components/KitPicker";
import { LockedPage } from "./components/LockedPage";
import { MarkdownPage } from "./components/MarkdownPage";
import { PromptModal } from "./components/Modal";
import { OneNoteImport } from "./components/OneNoteImport";
import { Settings } from "./components/Settings";
import { DiceRoller, Initiative } from "./components/Tools";
import { ViewPanel } from "./components/ViewPanel";
import { UpdateBanner, checkForUpdates, useAppVersion } from "./components/Updates";
import { type NB, NotebookCtx } from "./context";
import type { SaveState } from "./lib/autosave";
import { bridge, imageCache } from "./lib/bridge";
import { parseCanvas, serializeCanvas } from "./lib/canvas";
import { lockText, sessionPasswords, unlockText } from "./lib/crypto";
import { makeDemo } from "./lib/demo";
import { NotebookIndex, PAGE_EXTS } from "./lib/index";
import { replaceLinks } from "./lib/links";
import { type NotebookConfig, applyKit, emptyConfig, fillTemplate, isEmptyFolder, listTemplates, loadConfig, saveConfig } from "./lib/notebook";
import { type OrderItem, type OrderMap, loadOrder, orderPages, renameInOrder, saveOrder } from "./lib/order";
import { canImportOneNote } from "./lib/onenote-import";
import {
  type Entry,
  type Store,
  basename,
  canPickFolderInBrowser,
  dirname,
  ext,
  freeName,
  isTauri,
  join,
  openFolderPath,
  pickNotebook,
  stem,
} from "./lib/storage";

const HIDDEN = new Set(["_attachments", "_trash", "node_modules"]);
const visible = (e: Entry) => !e.name.startsWith(".") && !HIDDEN.has(e.name);
const sortDirs = (a: Entry, b: Entry) =>
  Number(a.name.startsWith("_")) - Number(b.name.startsWith("_")) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const isPage = (e: Entry) => !e.isDir && PAGE_EXTS.includes(ext(e.name));
const cleanName = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Modal =
  | { kind: "finder"; mode: "pages" | "text" }
  | { kind: "kit"; empty: boolean; first: boolean }
  | { kind: "settings" }
  | { kind: "onenote" }
  | { kind: "template"; template: string }
  | { kind: "lock" }
  | null;

const RECENT = "notesapp.recent";
const recentList = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const remember = (path?: string) => {
  if (!path) return;
  try {
    localStorage.setItem(RECENT, JSON.stringify([path, ...recentList().filter((p) => p !== path)].slice(0, 8)));
  } catch {
    /* ignore */
  }
};

export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [config, setConfig] = useState<NotebookConfig>(emptyConfig());
  const indexRef = useRef<NotebookIndex>(new NotebookIndex());
  const [indexVer, setIndexVer] = useState(0);
  const [order, setOrder] = useState<OrderMap>({});
  const [section, setSection] = useState("");
  const [page, setPage] = useState("");
  const [view, setView] = useState("");
  const [reload, setReload] = useState(0);
  const [pages, setPages] = useState<Entry[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [playerSafe, setPlayerSafe] = useState(false);
  const [loading, setLoading] = useState("");
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const refresh = () => setTick((t) => t + 1);
  const bump = () => setIndexVer((v) => v + 1);
  const index = indexRef.current;

  // ---------- opening ----------
  const openNotebook = useCallback(async (s: Store) => {
    setLoading(`Opening ${s.rootName}…`);
    try {
      const { config, exists } = await loadConfig(s);
      const empty = !exists && (await isEmptyFolder(s));
      indexRef.current = await NotebookIndex.build(s, config.templatesFolder);
      setOrder(await loadOrder(s));
      setConfig(config);
      setSection("");
      setPage("");
      setView("");
      setStore(s);
      bump();
      remember(s.rootPath);
      if (empty) setModal({ kind: "kit", empty: true, first: true });
      else {
        const start = indexRef.current.pages.has("Start here.canvas") ? "Start here.canvas" : "";
        if (start) setPage(start);
      }
    } catch (e) {
      setNotice(errText(e));
    } finally {
      setLoading("");
    }
  }, []);

  const guard = useCallback(async (work: () => Promise<void>) => {
    try {
      setNotice("");
      await flushRef.current?.();
      await work();
    } catch (e) {
      setNotice(errText(e));
    }
  }, []);

  // ---------- page list ----------
  useEffect(() => {
    if (!store) return;
    let alive = true;
    store.list(section).then(
      (items) => alive && setPages(items.filter(visible).filter(isPage)),
      () => alive && setPages([]),
    );
    return () => {
      alive = false;
    };
  }, [store, section, tick]);

  useEffect(() => {
    if (!store) return;
    listTemplates(store, config.templatesFolder).then(setTemplates, () => setTemplates([]));
  }, [store, config.templatesFolder, tick]);

  const ordered = useMemo(
    () => orderPages(pages, order[section]).filter((p) => !(playerSafe && index.pages.get(join(section, p.entry.name))?.secret)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages, order, section, playerSafe, indexVer],
  );

  const writeOrder = async (sec: string, items: OrderItem[]) => {
    if (!store) return;
    const next = { ...order, [sec]: items };
    setOrder(next);
    await saveOrder(store, next);
  };
  const currentItems = (): OrderItem[] => ordered.map((o) => (o.level ? { name: o.entry.name, level: o.level } : { name: o.entry.name }));

  // ---------- navigation ----------
  const openPath = useCallback(
    (path: string) =>
      guard(async () => {
        flushRef.current = null;
        setSaveState("saved");
        setView("");
        setSection(dirname(path));
        setPage(path);
      }),
    [guard],
  );

  const createPage = async (dir: string, title: string, extension: string, content: string) => {
    if (!store) return "";
    const name = await freeName(store, dir, cleanName(title) || "Untitled", extension);
    const path = join(dir, name);
    await store.writeText(path, content);
    index.setPage(path, content);
    bump();
    if (order[dir]) await writeOrder(dir, [...order[dir], { name }]);
    refresh();
    return path;
  };

  const newPage = () =>
    guard(async () => {
      const path = await createPage(section, "Untitled", "canvas", "");
      flushRef.current = null;
      setView("");
      setPage(path);
    });

  const createFromLink = (target: string, from: string) =>
    guard(async () => {
      const name = target.split("/").pop() ?? target;
      const path = await createPage(dirname(from), name, ext(from) === "md" ? "md" : "canvas", "");
      flushRef.current = null;
      setSection(dirname(path));
      setPage(path);
      setNotice(`Created the page “${stem(path)}”.`);
    });

  const changed = useCallback(
    (path: string, content?: string) => {
      if (content !== undefined && PAGE_EXTS.includes(ext(path))) index.setPage(path, content);
      else index.addFile(path);
      bump();
      refresh();
      if (path === page) setReload((r) => r + 1);
    },
    [index, page],
  );

  // ---------- editor bridge ----------
  useEffect(() => {
    bridge.currentPath = page;
  }, [page]);
  useEffect(() => {
    if (!store) return;
    bridge.pageNames = () => index.titles();
    bridge.open = (target, from) => {
      const hit = index.resolve(target, from);
      if (hit) void openPath(hit);
      else void createFromLink(target, from);
    };
    bridge.imageUrl = async (src, from) => {
      const file = index.resolveFile(src, from);
      if (!file) return null;
      const cached = imageCache.get(file);
      if (cached) return cached;
      try {
        const bytes = await store.readBytes(file);
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: file.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "" }));
        imageCache.set(file, url);
        return url;
      } catch {
        return null;
      }
    };
  });

  // ---------- page actions ----------
  const renamePage = (title: string) =>
    guard(async () => {
      const name = cleanName(title);
      if (!store || !page || !name || name === stem(page)) return;
      const oldStem = stem(page);
      const linking = index.backlinks(page);
      const to = join(dirname(page), `${name}.${ext(page)}`);
      await store.move(page, to);
      const content = ext(to) === "locked" ? "" : await store.readText(to);
      index.remove(page);
      index.setPage(to, content);
      await writeOrder(dirname(page), (order[dirname(page)] ?? currentItems()).map((it) => (it.name === basename(page) ? { ...it, name: basename(to) } : it)));
      let updated = 0;
      for (const p of linking) {
        const src = await store.readText(p);
        let out = src;
        if (ext(p) === "canvas") {
          const doc = parseCanvas(src);
          for (const n of doc.nodes) {
            if (typeof n.text !== "string") continue;
            const r = replaceLinks(n.text, oldStem, name);
            n.text = r.text;
            updated += r.count;
          }
          out = serializeCanvas(doc);
        } else {
          const r = replaceLinks(src, oldStem, name);
          out = r.text;
          updated += r.count;
        }
        if (out !== src) {
          await store.writeText(p, out);
          index.setPage(p, out);
        }
      }
      flushRef.current = null;
      bump();
      setPage(to);
      refresh();
      if (updated) setNotice(`Renamed. Updated ${updated} ${updated === 1 ? "link" : "links"} in ${linking.length} ${linking.length === 1 ? "page" : "pages"}.`);
    });

  const deletePage = () =>
    guard(async () => {
      if (!store || !page) return;
      const name = await freeName(store, "_trash", stem(page), ext(page));
      await store.move(page, join("_trash", name));
      index.remove(page);
      bump();
      await writeOrder(dirname(page), currentItems().filter((it) => it.name !== basename(page)));
      flushRef.current = null;
      setPage("");
      refresh();
      setNotice(`Moved “${stem(page)}” to the _trash folder in this notebook.`);
    });

  const lockPage = async (password: string) => {
    if (!store || !page) return;
    await flushRef.current?.();
    const kind = ext(page) as "md" | "canvas";
    const content = await store.readText(page);
    const name = await freeName(store, dirname(page), stem(page), "locked");
    const to = join(dirname(page), name);
    await store.writeText(to, await lockText(content, password, kind));
    await store.remove(page);
    // Backups made by this app would still hold the readable text.
    let removed = 0;
    for (const e of await store.list("_trash/backups").catch(() => [] as Entry[])) {
      if (e.name.startsWith(basename(page) + ".")) {
        await store.remove(join("_trash/backups", e.name));
        removed++;
      }
    }
    index.remove(page);
    index.setPage(to, "");
    await writeOrder(dirname(page), renameInOrder({ x: currentItems() }, "x", basename(page), name).x);
    sessionPasswords.set((store.rootPath ?? store.rootName) + "::", password);
    flushRef.current = null;
    bump();
    setPage(to);
    refresh();
    setNotice(
      "Page locked. It is encrypted on disk." +
        (removed ? ` Removed ${removed} unencrypted backup${removed > 1 ? "s" : ""} of it.` : "") +
        " Copies elsewhere (other backups, sync history) are not affected.",
    );
  };

  const removeLock = (password: string) =>
    guard(async () => {
      if (!store || !page) return;
      const { text, kind } = await unlockText(await store.readText(page), password);
      const name = await freeName(store, dirname(page), stem(page), kind);
      const to = join(dirname(page), name);
      await store.writeText(to, text);
      await store.remove(page);
      index.remove(page);
      index.setPage(to, text);
      await writeOrder(dirname(page), renameInOrder({ x: currentItems() }, "x", basename(page), name).x);
      flushRef.current = null;
      bump();
      setPage(to);
      refresh();
      setNotice("Lock removed. The page is readable on disk again.");
    });

  const saveSettings = async (c: NotebookConfig) => {
    if (!store) return;
    await saveConfig(store, c);
    setConfig(c);
    if (c.templatesFolder !== index.templatesFolder) {
      indexRef.current = await NotebookIndex.build(store, c.templatesFolder);
    }
    bump();
    refresh();
  };

  const closeNotebook = () =>
    guard(async () => {
      imageCache.clear();
      sessionPasswords.clear();
      setStore(null);
      setPage("");
      setView("");
      setPlayerSafe(false);
    });

  // ---------- keyboard ----------
  useEffect(() => {
    if (!store) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if ((k === "p" || k === "o") && !e.shiftKey) {
        e.preventDefault();
        setModal({ kind: "finder", mode: "pages" });
      } else if (k === "f" && e.shiftKey) {
        e.preventDefault();
        setModal({ kind: "finder", mode: "text" });
      } else if (k === "k" && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new Event("notesapp:link"));
      } else if (k === "n" && !e.shiftKey) {
        e.preventDefault();
        void newPage();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- render ----------
  const updateBanner = <UpdateBanner beforeInstall={async () => void (await flushRef.current?.())} />;
  if (!store)
    return (
      <>
        {updateBanner}
        <Welcome loading={loading} notice={notice} onOpen={openNotebook} />
      </>
    );

  const nb: NB = { store, config, index, indexVer, playerSafe, openPath: (p) => void openPath(p), changed, notice: setNotice, createPage };
  const activeView = config.views.find((v) => v.id === view);
  const pageKey = `${page}#${reload}`;
  const pageProps = {
    store,
    path: page,
    onState: setSaveState,
    flushRef,
    onSaved: (content: string) => {
      index.setPage(page, content);
      bump();
    },
  };

  return (
    <NotebookCtx.Provider value={nb}>
      {updateBanner}
      <div className={"app" + (playerSafe ? " player-safe" : "")}>
        <aside className="sections">
          <div className="notebook-name" title={store.rootPath ?? store.rootName}>
            {store.rootName}
            {config.kitName && <span className="kit-name">{config.kitName}</span>}
          </div>
          <div className="finder-buttons">
            <button onClick={() => setModal({ kind: "finder", mode: "pages" })} title="Ctrl+P">
              Go to page
            </button>
            <button onClick={() => setModal({ kind: "finder", mode: "text" })} title="Ctrl+Shift+F">
              Search
            </button>
          </div>
          <div className="tree">
            <div className="side-label">Sections</div>
            <button className={"tree-row" + (section === "" && !view ? " selected" : "")} onClick={() => (setSection(""), setView(""))}>
              <span className="twisty" />
              Loose pages
            </button>
            <SectionTree
              store={store}
              dir=""
              depth={0}
              selected={view ? "\0" : section}
              tick={tick}
              onSelect={(d) => {
                setSection(d);
                setView("");
              }}
              onRename={(path, title) =>
                guard(async () => {
                  const name = cleanName(title);
                  if (!name || name === basename(path)) return;
                  const to = join(dirname(path), name);
                  await store.move(path, to);
                  const swap = (p: string) => (p === path || p.startsWith(path + "/") ? to + p.slice(path.length) : p);
                  const nextOrder: OrderMap = {};
                  for (const [k, v] of Object.entries(order)) nextOrder[swap(k)] = v;
                  setOrder(nextOrder);
                  await saveOrder(store, nextOrder);
                  indexRef.current = await NotebookIndex.build(store, config.templatesFolder);
                  bump();
                  flushRef.current = null;
                  setSection(swap);
                  setPage(swap);
                  refresh();
                })
              }
            />
            {config.views.length > 0 && (
              <>
                <div className="side-label">Views</div>
                {config.views.map((v) => (
                  <button key={v.id} className={"tree-row" + (view === v.id ? " selected" : "")} onClick={() => guard(async () => setView(v.id))}>
                    <span className="twisty">{{ table: "▤", board: "▥", schedule: "▦" }[v.kind]}</span>
                    {v.name}
                  </button>
                ))}
              </>
            )}
            {config.tools.some((t) => t !== "player-safe") && <div className="side-label">Tools</div>}
            {config.tools.includes("dice") && (
              <button className={"tree-row" + (view === "tool:dice" ? " selected" : "")} onClick={() => guard(async () => setView("tool:dice"))}>
                <span className="twisty">⚄</span>Dice
              </button>
            )}
            {config.tools.includes("initiative") && (
              <button className={"tree-row" + (view === "tool:initiative" ? " selected" : "")} onClick={() => guard(async () => setView("tool:initiative"))}>
                <span className="twisty">⚔</span>Initiative
              </button>
            )}
            {config.tools.includes("player-safe") && (
              <label className={"player-safe-toggle" + (playerSafe ? " on" : "")} title="Hides secret boxes, callouts, cards and pages">
                <input type="checkbox" checked={playerSafe} onChange={(e) => setPlayerSafe(e.target.checked)} />
                Player-safe {playerSafe ? "on" : "off"}
              </label>
            )}
          </div>
          <div className="side-actions">
            <button onClick={() => newSection("")}>+ Section</button>
            <button onClick={() => newSection(section)} disabled={!section} title="New section inside the selected one">
              + Subsection
            </button>
          </div>
          <div className="side-links">
            <button className="link" onClick={() => setModal({ kind: "settings" })}>
              Settings
            </button>
            <button className="link" onClick={() => setModal({ kind: "onenote" })} title={canImportOneNote() ? "" : "Needs the desktop app on Windows"}>
              Import OneNote
            </button>
            <button className="link" onClick={closeNotebook}>
              Close
            </button>
          </div>
        </aside>

        <aside className="pages">
          <div className="page-buttons">
            <button className="primary" onClick={newPage} title="Ctrl+N">
              + New page
            </button>
            {templates.length > 0 && (
              <select value="" onChange={(e) => e.target.value && setModal({ kind: "template", template: e.target.value })} aria-label="New page from template">
                <option value="">From template…</option>
                {templates.map((t) => (
                  <option key={t} value={t}>
                    {stem(t)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <PageList
            items={ordered}
            section={section}
            selected={view ? "" : page}
            onOpen={(p) => void openPath(p)}
            onReorder={(items) => void writeOrder(section, items)}
          />
        </aside>

        <main className="main">
          {notice && (
            <div className="notice" onClick={() => setNotice("")} title="Click to dismiss">
              {notice}
            </div>
          )}
          {activeView && <ViewPanel key={activeView.id} view={activeView} />}
          {view === "tool:dice" && <DiceRoller />}
          {view === "tool:initiative" && <Initiative />}
          {!view && page && (
            <>
              <header className="page-header">
                <TitleInput key={page} value={stem(page)} onCommit={renamePage} />
                <span className={"save save-" + saveState}>{{ saved: "Saved", dirty: "Editing…", saving: "Saving…", error: "Could not save" }[saveState]}</span>
                {ext(page) !== "locked" && (
                  <button className="quiet" onClick={() => setModal({ kind: "lock" })} title="Encrypt this page with a password">
                    Lock
                  </button>
                )}
                <button className="quiet" onClick={() => window.print()} title="Print, or save as PDF">
                  PDF
                </button>
                <ConfirmButton key={"del" + page} label="Delete" onConfirm={deletePage} />
              </header>
              {ext(page) === "canvas" && <CanvasPage key={pageKey} {...pageProps} />}
              {ext(page) === "md" && <MarkdownPage key={pageKey} {...pageProps} />}
              {ext(page) === "locked" && <LockedPage key={pageKey} {...pageProps} onRemoveLock={removeLock} />}
              {ext(page) !== "locked" && <Backlinks path={page} />}
            </>
          )}
          {!view && !page && <div className="page-message">Pick a page, or create a new one. Ctrl+P jumps to any page.</div>}
        </main>
      </div>

      {modal?.kind === "finder" && (
        <Finder
          mode={modal.mode}
          onClose={() => setModal(null)}
          onCreate={(name) =>
            void guard(async () => {
              const path = await createPage(section, name, "canvas", "");
              setView("");
              setPage(path);
            })
          }
        />
      )}
      {modal?.kind === "kit" && (
        <KitPicker
          title={modal.first ? "What is this notebook for?" : "Add a kit to this notebook"}
          emptyFolder={modal.empty}
          allowNone={modal.first}
          onClose={() => setModal(null)}
          onPick={async (kit, opts) => {
            const next = await applyKit(store, kit, config, opts);
            setConfig(next);
            indexRef.current = await NotebookIndex.build(store, next.templatesFolder);
            bump();
            refresh();
            setModal(null);
            if (opts.startPage && indexRef.current.pages.has("Start here.canvas")) void openPath("Start here.canvas");
          }}
        />
      )}
      {modal?.kind === "settings" && <Settings onClose={() => setModal(null)} onSave={saveSettings} onAddKit={() => setModal({ kind: "kit", empty: false, first: false })} />}
      {modal?.kind === "onenote" && (
        <OneNoteImport
          onClose={() => setModal(null)}
          onDone={async (report) => {
            setOrder(await loadOrder(store));
            indexRef.current = await NotebookIndex.build(store, config.templatesFolder);
            bump();
            refresh();
            setModal(null);
            void openPath(report);
          }}
        />
      )}
      {modal?.kind === "template" && (
        <PromptModal
          title={`New ${stem(modal.template)} page`}
          fields={[{ key: "title", label: "Page name", value: "" }]}
          submit="Create"
          onClose={() => setModal(null)}
          onSubmit={async ({ title }) => {
            const name = cleanName(title) || "Untitled";
            const content = fillTemplate(await store.readText(modal.template), name);
            const dir = section && section !== config.templatesFolder ? section : "";
            const path = await createPage(dir, name, ext(modal.template), content);
            setModal(null);
            flushRef.current = null;
            setView("");
            setSection(dir);
            setPage(path);
          }}
        />
      )}
      {modal?.kind === "lock" && (
        <PromptModal
          title={`Lock “${stem(page)}”`}
          note="The page is encrypted with this password (AES-256). Without the password nobody can read it, including you: there is no way to recover a forgotten password."
          fields={[
            { key: "a", label: "Password", type: "password" },
            { key: "b", label: "Type it again", type: "password" },
          ]}
          submit="Lock page"
          onClose={() => setModal(null)}
          onSubmit={async ({ a, b }) => {
            if (a.length < 6) throw new Error("Use at least 6 characters.");
            if (a !== b) throw new Error("The two passwords are not the same.");
            await lockPage(a);
            setModal(null);
          }}
        />
      )}
    </NotebookCtx.Provider>
  );

  function newSection(parent: string) {
    void guard(async () => {
      if (!store) return;
      const name = await freeName(store, parent, "New section", "");
      await store.mkdir(join(parent, name));
      refresh();
      setView("");
      setSection(join(parent, name));
      setPage("");
    });
  }
}

function Welcome({ onOpen, loading, notice }: { onOpen: (s: Store) => void; loading: string; notice: string }) {
  const canOpen = isTauri || canPickFolderInBrowser;
  const recent = isTauri ? recentList() : [];
  const version = useAppVersion();
  return (
    <div className="welcome">
      <h1>Notes App</h1>
      <p>A notebook is just a folder. Sections are subfolders, pages are files you own. Pick an empty folder to start a new notebook, or any folder (an Obsidian vault too) to open it.</p>
      <div className="welcome-actions">
        <button
          className="primary"
          disabled={!canOpen || !!loading}
          onClick={async () => {
            const s = await pickNotebook();
            if (s) onOpen(s);
          }}
        >
          Open or create a notebook…
        </button>
        <button disabled={!!loading} onClick={async () => onOpen(await makeDemo())}>
          Try the demo campaign
        </button>
      </div>
      {loading && <p>{loading}</p>}
      {notice && <p className="error">{notice}</p>}
      {recent.length > 0 && (
        <div className="recent">
          <div className="side-label">Recent</div>
          {recent.map((p) => (
            <button key={p} className="link" onClick={async () => onOpen(await openFolderPath(p))}>
              {p}
            </button>
          ))}
        </div>
      )}
      {!canOpen && <p className="muted">This browser cannot open folders. Use the desktop app, Chrome or Edge.</p>}
      {isTauri && (
        <p className="muted small">
          Version {version}{" "}
          <button className="link inline" onClick={checkForUpdates}>
            Check for updates
          </button>
        </p>
      )}
      <p className="muted small">Opening an Obsidian vault works as it is. Editing a note rewrites its Markdown, and the original is kept in _trash/backups. Try it on a copy first.</p>
    </div>
  );
}

function PageList(props: {
  items: { entry: Entry; level: number }[];
  section: string;
  selected: string;
  onOpen: (path: string) => void;
  onReorder: (items: OrderItem[]) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const asItems = (list: { entry: Entry; level: number }[]): OrderItem[] => list.map((o) => (o.level ? { name: o.entry.name, level: o.level } : { name: o.entry.name }));
  const setLevel = (name: string, delta: number) => {
    const list = props.items.map((o, i) => {
      if (o.entry.name !== name) return o;
      const max = i === 0 ? 0 : props.items[i - 1].level + 1;
      return { ...o, level: Math.max(0, Math.min(max, o.level + delta, 3)) };
    });
    props.onReorder(asItems(list));
  };
  return (
    <div className="page-list">
      {props.items.map(({ entry, level }) => {
        const path = join(props.section, entry.name);
        return (
          <button
            key={entry.name}
            className={"page-row" + (path === props.selected ? " selected" : "") + (over === entry.name ? " drop" : "")}
            style={{ paddingLeft: 8 + level * 16 }}
            draggable
            onDragStart={() => setDrag(entry.name)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(entry.name);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              if (!drag || drag === entry.name) return;
              const list = props.items.filter((o) => o.entry.name !== drag);
              const moved = props.items.find((o) => o.entry.name === drag)!;
              const at = list.findIndex((o) => o.entry.name === entry.name);
              list.splice(at, 0, moved);
              props.onReorder(asItems(list));
              setDrag(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                setLevel(entry.name, e.shiftKey ? -1 : 1);
              }
            }}
            onClick={() => props.onOpen(path)}
            title="Drag to reorder. Tab / Shift+Tab makes it a subpage."
          >
            <span className="page-title">{stem(entry.name)}</span>
            {ext(entry.name) === "md" && <span className="tag">text</span>}
            {ext(entry.name) === "locked" && <span className="tag">locked</span>}
          </button>
        );
      })}
      {props.items.length === 0 && <div className="empty">No pages here yet</div>}
    </div>
  );
}

interface TreeProps {
  store: Store;
  dir: string;
  depth: number;
  selected: string;
  tick: number;
  onSelect: (dir: string) => void;
  onRename: (path: string, name: string) => void;
}

function SectionTree(props: TreeProps) {
  const { store, dir, depth, selected, tick, onSelect, onRename } = props;
  const [dirs, setDirs] = useState<Entry[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState("");

  useEffect(() => {
    let alive = true;
    store.list(dir).then(
      (items) => alive && setDirs(items.filter((e) => e.isDir && visible(e)).sort(sortDirs)),
      () => alive && setDirs([]),
    );
    return () => {
      alive = false;
    };
  }, [store, dir, tick]);

  return (
    <>
      {dirs.map((d) => {
        const path = join(dir, d.name);
        const isOpen = open[d.name] ?? (selected === path || selected.startsWith(path + "/"));
        return (
          <div key={d.name}>
            <div className={"tree-row" + (selected === path ? " selected" : "")} style={{ paddingLeft: 8 + depth * 14 }}>
              <button className="twisty" onClick={() => setOpen((o) => ({ ...o, [d.name]: !isOpen }))} aria-label={`Expand ${d.name}`}>
                {isOpen ? "▾" : "▸"}
              </button>
              {editing === d.name ? (
                <TitleInput
                  value={d.name}
                  autoFocus
                  onCommit={(name) => {
                    setEditing("");
                    onRename(path, name);
                  }}
                />
              ) : (
                <button className="tree-label" onClick={() => onSelect(path)} onDoubleClick={() => setEditing(d.name)} title="Double-click to rename">
                  {d.name}
                </button>
              )}
            </div>
            {isOpen && <SectionTree {...props} dir={path} depth={depth + 1} />}
          </div>
        );
      })}
    </>
  );
}

function TitleInput({ value, onCommit, autoFocus }: { value: string; onCommit: (v: string) => void; autoFocus?: boolean }) {
  const [text, setText] = useState(value);
  return (
    <input
      className="title-input"
      value={text}
      autoFocus={autoFocus}
      aria-label="Name"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(value);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

function ConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className={armed ? "danger" : "quiet"} onClick={() => (armed ? onConfirm() : setArmed(true))} onBlur={() => setArmed(false)}>
      {armed ? "Really delete?" : label}
    </button>
  );
}
