import { useMemo, useState } from "react";
import { useNB } from "../context";
import { dirname } from "../lib/storage";
import { Modal } from "./Modal";
import { t } from "../lib/i18n";

/** Ctrl+P jumps to a page by name; Ctrl+Shift+F searches the text of every page. */
export function Finder({ mode, onClose, onCreate }: { mode: "pages" | "text"; onClose: () => void; onCreate: (name: string) => void }) {
  const nb = useNB();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    if (mode === "pages") return nb.index.findTitles(q, 40).filter((p) => !(nb.playerSafe && p.secret)).map((p) => ({ path: p.path, title: p.title, snippet: "" }));
    return nb.index.search(q, 60).filter((r) => !(nb.playerSafe && nb.index.pages.get(r.path)?.secret));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mode, nb.indexVer, nb.playerSafe]);
  const canCreate = mode === "pages" && q.trim() && !results.some((r) => r.title.toLowerCase() === q.trim().toLowerCase());
  const total = results.length + (canCreate ? 1 : 0);
  const choose = (i: number) => {
    if (i < results.length) nb.openPath(results[i].path);
    else if (canCreate) onCreate(q.trim());
    onClose();
  };
  return (
    <Modal title={mode === "pages" ? t("Go to page") : t("Search all pages")} onClose={onClose} wide={mode === "text"}>
      <input
        className="finder-input"
        autoFocus
        placeholder={mode === "pages" ? t("Page name…") : t("Words to find…")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(total - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && total) {
            e.preventDefault();
            choose(active);
          }
        }}
      />
      <div className="finder-list">
        {results.map((r, i) => (
          <button key={r.path} className={"finder-row" + (i === active ? " active" : "")} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}>
            <span className="finder-title">{r.title}</span>
            <span className="finder-path">{dirname(r.path) || t("Loose pages")}</span>
            {r.snippet && <span className="finder-snippet">{r.snippet}</span>}
          </button>
        ))}
        {canCreate && (
          <button className={"finder-row" + (active === results.length ? " active" : "")} onClick={() => choose(results.length)}>
            <span className="finder-title">{t("Create page “{0}”", q.trim())}</span>
          </button>
        )}
        {!total && q && <div className="empty">{t("Nothing found")}</div>}
      </div>
    </Modal>
  );
}

export function Backlinks({ path }: { path: string }) {
  const nb = useNB();
  const links = useMemo(
    () => nb.index.backlinks(path),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, nb.indexVer],
  );
  const [open, setOpen] = useState(false);
  if (!links.length) return null;
  return (
    <div className={"backlinks" + (open ? " open" : "")}>
      <button className="quiet" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {links.length === 1 ? t("Linked from 1 page") : t("Linked from {0} pages", links.length)}
      </button>
      {open && (
        <div className="backlink-list">
          {links.map((p) => (
            <button key={p} className="link" onClick={() => nb.openPath(p)}>
              {nb.index.pages.get(p)?.title ?? p}
              <span className="muted"> · {dirname(p) || t("Loose pages")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
