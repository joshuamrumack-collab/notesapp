import { useEffect, useMemo, useRef, useState } from "react";
import { useNB } from "../context";
import { bridge } from "../lib/bridge";
import { newCardText } from "../lib/cards";
import { collectImages, saveImages } from "../lib/dropImages";
import { orderPages, loadOrder, type OrderMap } from "../lib/order";
import { type Entry, dirname, ext, join, stem } from "../lib/storage";
import { t } from "../lib/i18n";

const COVERS = ".notesapp/covers.json";
const HIDDEN = new Set(["_attachments", "_trash", "node_modules"]);

function useImage(path?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!path) return;
    let alive = true;
    bridge.imageUrl(path, "").then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="page-header">
      <h1 className="view-title">{title}</h1>
      {children}
    </header>
  );
}

// ---------- Contents: the notebook as a book, for you or your players ----------

interface Section {
  path: string;
  name: string;
  pages: string[];
  subs: Section[];
}

export function Contents() {
  const nb = useNB();
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<OrderMap>({});
  const [tree, setTree] = useState<Section[]>([]);
  const [loose, setLoose] = useState<string[]>([]);

  useEffect(() => {
    nb.store.readText(COVERS).then((s) => setCovers(JSON.parse(s)), () => setCovers({}));
    loadOrder(nb.store).then(setOrder);
  }, [nb.store]);

  useEffect(() => {
    let alive = true;
    const visible = (e: Entry) => !e.name.startsWith(".") && !HIDDEN.has(e.name) && e.name !== nb.config.templatesFolder;
    const read = async (dir: string, depth: number): Promise<{ subs: Section[]; pages: string[] }> => {
      const items = (await nb.store.list(dir).catch(() => [] as Entry[])).filter(visible);
      const pageEntries = items.filter((e) => !e.isDir && nb.index.pages.has(join(dir, e.name)));
      const pages = orderPages(pageEntries, order[dir])
        .map((o) => join(dir, o.entry.name))
        .filter((p) => !(nb.playerSafe && nb.index.pages.get(p)?.secret));
      const subs: Section[] = [];
      if (depth < 3) {
        for (const d of items.filter((e) => e.isDir).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
          const path = join(dir, d.name);
          const inner = await read(path, depth + 1);
          subs.push({ path, name: d.name, pages: inner.pages, subs: inner.subs });
        }
      }
      return { subs, pages };
    };
    read("", 0).then((r) => {
      if (!alive) return;
      setTree(r.subs);
      setLoose(r.pages);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nb.store, nb.indexVer, order, nb.playerSafe]);

  const setCover = async (section: string, files: File[] | DataTransfer) => {
    const src = files instanceof DataTransfer ? collectImages(files) : { files, urls: [] };
    const { saved, failed } = await saveImages(nb.store, src);
    if (!saved[0]) return failed[0] && nb.notice(t("Could not use that picture ({0}).", failed[0]));
    nb.index.addFile(saved[0].path);
    const next = { ...covers, [section]: saved[0].path };
    setCovers(next);
    await nb.store.writeText(COVERS, JSON.stringify(next, null, "\t") + "\n");
  };

  return (
    <div className="view">
      <Header title={t("{0}: contents", nb.store.rootName)}>
        <span className="muted small">{nb.playerSafe ? t("Player-safe: secret pages are hidden.") : t("Drop a picture on a cover to change it.")}</span>
      </Header>
      <div className="view-body">
        <div className="covers">
          {tree.map((s) => (
            <Cover key={s.path} section={s} cover={covers[s.path]} onCover={(f) => void setCover(s.path, f)} />
          ))}
        </div>
        {loose.length > 0 && (
          <section className="contents-loose">
            <h3>{t("Other pages")}</h3>
            <PageLinks pages={loose} />
          </section>
        )}
      </div>
    </div>
  );
}

function PageLinks({ pages }: { pages: string[] }) {
  const nb = useNB();
  return (
    <ul className="toc">
      {pages.map((p) => (
        <li key={p}>
          <button className="link" data-preview={nb.index.linkTo(p)} onClick={() => nb.openPath(p)}>
            {nb.index.cards.get(p)?.[0]?.title ?? stem(p)}
          </button>
          {ext(p) === "map" && <span className="tag">{t("map")}</span>}
        </li>
      ))}
    </ul>
  );
}

function Cover({ section, cover, onCover }: { section: Section; cover?: string; onCover: (f: File[] | DataTransfer) => void }) {
  const nb = useNB();
  // Without a chosen cover, use the first picture found in the section.
  const fallback = useMemo(() => {
    for (const p of [...section.pages, ...section.subs.flatMap((s) => s.pages)]) {
      const img = nb.index.pages.get(p)?.image;
      if (img) return nb.index.resolveFile(img, p) ?? undefined;
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, nb.indexVer]);
  const url = useImage(cover ?? fallback);
  const input = useRef<HTMLInputElement>(null);
  const total = section.pages.length + section.subs.reduce((n, s) => n + s.pages.length, 0);
  return (
    <article className="cover">
      <div
        className="cover-art"
        style={url ? { backgroundImage: `url(${url})` } : undefined}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onCover(e.dataTransfer);
        }}
      >
        <h2>{section.name}</h2>
        <button className="cover-btn" onClick={() => input.current?.click()} title={t("Choose a cover picture")}>
          ✎
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files && onCover(Array.from(e.target.files))} />
      </div>
      <div className="cover-body">
        <span className="muted small">
          {t("{0} pages", total)}
        </span>
        <PageLinks pages={section.pages.slice(0, 12)} />
        {section.pages.length > 12 && <span className="muted small">{t("and {0} more", section.pages.length - 12)}</span>}
        {section.subs.map((s) => (
          <details key={s.path} className="toc-sub">
            <summary>
              {s.name} <span className="muted">({s.pages.length})</span>
            </summary>
            <PageLinks pages={s.pages} />
          </details>
        ))}
      </div>
    </article>
  );
}

// ---------- Tags ----------

export function TagBrowser({ selected, onSelect }: { selected: string; onSelect: (t: string) => void }) {
  const nb = useNB();
  const tags = useMemo(
    () => nb.index.tags(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nb.indexVer],
  );
  const chosen = selected.toLowerCase();
  const pages = (tags.get(chosen) ?? []).filter((p) => !(nb.playerSafe && nb.index.pages.get(p)?.secret));
  // Nested tags: "places/city" also counts under "places".
  const withChildren = [...tags].filter(([t]) => t === chosen || t.startsWith(chosen + "/")).flatMap(([, ps]) => ps);
  const shown = chosen ? [...new Set([...pages, ...withChildren])] : [];
  return (
    <div className="view">
      <Header title={t("Tags")} />
      <div className="view-body tags-view">
        <div className="tag-cloud">
          {tags.size === 0 && <p className="muted">{t("No tags yet. Add tags with “+ Tag” above a page, or type #something in the text.")}</p>}
          {[...tags].map(([t, ps]) => (
            <button key={t} className={"tag-pill" + (t === chosen ? " selected" : "")} onClick={() => onSelect(t)} style={{ fontSize: Math.min(20, 12 + ps.length) }}>
              #{t} <span className="muted">{ps.length}</span>
            </button>
          ))}
        </div>
        {chosen && (
          <section>
            <h3>#{chosen}</h3>
            {shown.length === 0 && <p className="muted">{t("No pages have this tag.")}</p>}
            <div className="tag-pages">
              {shown.map((p) => {
                const info = nb.index.pages.get(p);
                return (
                  <button key={p} className="tag-page" data-preview={nb.index.linkTo(p)} onClick={() => nb.openPath(p)}>
                    <strong>{nb.index.cards.get(p)?.[0]?.title ?? info?.title}</strong>
                    <span className="muted small">{dirname(p) || t("Loose pages")}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ---------- To write: placeholders ----------

export function ToWrite() {
  const nb = useNB();
  const list = useMemo(
    () => nb.index.unwritten(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nb.indexVer],
  );
  const [types, setTypes] = useState<Record<string, string>>({});
  const create = async (target: string, from: string[]) => {
    const name = target.split("/").pop() ?? target;
    const typeId = types[target];
    const type = nb.config.cardTypes.find((c) => c.id === typeId);
    // Put it next to other cards of that type, or next to the page that mentions it most.
    let dir = dirname(from[0] ?? "");
    if (type) {
      const dirs = nb.index.allCards().filter((c) => c.type === type.id).map((c) => dirname(c.path));
      if (dirs.length) dir = dirs.sort((a, b) => dirs.filter((x) => x === b).length - dirs.filter((x) => x === a).length)[0];
    }
    const nameKey = type?.fields.find((f) => ["name", "title"].includes(f.key))?.key;
    const content = type ? newCardText(type, nameKey ? { [nameKey]: name } : {}) + `\n# ${name}\n` : `# ${name}\n\n`;
    const path = await nb.createPage(dir, name, "md", content);
    nb.openPath(path);
  };
  return (
    <div className="view">
      <Header title={t("To write")}>
        <span className="muted small">{t("Links to pages that do not exist yet, most mentioned first.")}</span>
      </Header>
      <div className="view-body">
        {list.length === 0 && <p className="muted">{t("Nothing waiting. When you link to a page you have not written yet, it shows up here.")}</p>}
        <table className="view-table">
          <tbody>
            {list.map(({ target, from }) => (
              <tr key={target}>
                <td>
                  <strong className="wikilink missing">{target}</strong>
                </td>
                <td className="small">
                  {t("Mentioned in")}{" "}
                  {from.map((p, i) => (
                    <span key={p}>
                      {i > 0 && ", "}
                      <button className="link inline" data-preview={nb.index.linkTo(p)} onClick={() => nb.openPath(p)}>
                        {stem(p)}
                      </button>
                    </span>
                  ))}
                </td>
                <td className="todo-actions">
                  {nb.config.cardTypes.length > 0 && (
                    <select value={types[target] ?? ""} onChange={(e) => setTypes({ ...types, [target]: e.target.value })} aria-label={t("Kind of page")}>
                      <option value="">{t("Plain page")}</option>
                      {nb.config.cardTypes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button className="primary" onClick={() => void create(target, from).catch((e) => nb.notice(String(e)))}>
                    {t("Write it")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
