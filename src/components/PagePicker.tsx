import { useEffect, useMemo, useRef, useState } from "react";
import { useNB } from "../context";
import { newCardText } from "../lib/cards";
import { bridge } from "../lib/bridge";
import { dirname } from "../lib/storage";

interface Option {
  path: string;
  title: string;
  where: string;
}

const currentPage = () => bridge.currentPath;

/**
 * A searchable list of pages that drops down under a button. With `cardType`, it lists only cards of that
 * type (for example Locations for an NPC's Location field) and can make a new one.
 */
export function PagePicker(props: {
  cardType?: string;
  initial?: string;
  onPick: (path: string) => void;
  onClose: () => void;
  onClear?: () => void;
}) {
  const nb = useNB();
  const [q, setQ] = useState(props.initial ?? "");
  const [active, setActive] = useState(0);
  const [anyPage, setAnyPage] = useState(!props.cardType);
  const box = useRef<HTMLDivElement>(null);
  const type = nb.config.cardTypes.find((c) => c.id === props.cardType);

  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && props.onClose();
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [props]);

  const options: Option[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!anyPage && props.cardType) {
      const seen = new Set<string>();
      return nb.index
        .allCards()
        .filter((c) => c.type === props.cardType)
        .filter((c) => !(nb.playerSafe && c.data.secret === true))
        .filter((c) => !needle || c.title.toLowerCase().includes(needle) || c.path.toLowerCase().includes(needle))
        .filter((c) => (seen.has(c.path) ? false : (seen.add(c.path), true)))
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 40)
        .map((c) => ({ path: c.path, title: c.title, where: dirname(c.path) || "Loose pages" }));
    }
    return nb.index
      .findTitles(needle, 40)
      .filter((p) => !(nb.playerSafe && p.secret) && !p.path.startsWith(nb.config.templatesFolder + "/"))
      .map((p) => ({ path: p.path, title: p.title, where: dirname(p.path) || "Loose pages" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, anyPage, props.cardType, nb.indexVer, nb.playerSafe]);

  const canCreate = q.trim() && !options.some((o) => o.title.toLowerCase() === q.trim().toLowerCase());
  const total = options.length + (canCreate ? 1 : 0);

  const create = async () => {
    const title = q.trim();
    let dir = "";
    let content = "";
    if (type && !anyPage) {
      // Put it next to the other cards of this type, e.g. a new Location in "Locations".
      const dirs = nb.index.allCards().filter((c) => c.type === type.id).map((c) => dirname(c.path));
      const counts = new Map<string, number>();
      for (const d of dirs) counts.set(d, (counts.get(d) ?? 0) + 1);
      dir = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      const nameKey = type.fields.find((f) => ["name", "title"].includes(f.key))?.key;
      content = newCardText(type, nameKey ? { [nameKey]: title } : {}) + `\n# ${title}\n`;
    } else {
      dir = dirname(nb.index.pages.has(currentPage()) ? currentPage() : "");
    }
    const path = await nb.createPage(dir, title, "md", content);
    props.onPick(path);
  };

  const choose = (i: number) => {
    if (i < options.length) props.onPick(options[i].path);
    else if (canCreate) void create().catch((e) => nb.notice(String(e)));
  };

  return (
    <div className="picker" ref={box} onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <input
        autoFocus
        className="picker-input"
        placeholder={type && !anyPage ? `Find a ${type.name.toLowerCase()}…` : "Find a page…"}
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
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (total) choose(active);
          } else if (e.key === "Escape") {
            e.preventDefault();
            props.onClose();
          }
        }}
      />
      <div className="picker-list">
        {options.map((o, i) => (
          <button key={o.path} className={"picker-row" + (i === active ? " active" : "")} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}>
            <span>{o.title}</span>
            <span className="muted small">{o.where}</span>
          </button>
        ))}
        {canCreate && (
          <button className={"picker-row picker-new" + (active === options.length ? " active" : "")} onClick={() => choose(options.length)}>
            + New {type && !anyPage ? type.name.toLowerCase() : "page"} “{q.trim()}”
          </button>
        )}
        {!total && <div className="empty">{type && !anyPage ? `No ${type.name} cards yet. Type a name to make one.` : "No pages found"}</div>}
      </div>
      <div className="picker-foot">
        {props.cardType && (
          <label className="small">
            <input type="checkbox" checked={anyPage} onChange={(e) => setAnyPage(e.target.checked)} /> Show all pages
          </label>
        )}
        {props.onClear && (
          <button className="quiet small" onClick={props.onClear}>
            Remove link
          </button>
        )}
      </div>
    </div>
  );
}

/** Insert a link to `path` where the cursor is in the last-used text box. Returns false if there was none. */
export function insertLink(editor: import("@tiptap/core").Editor | null, inner: string): boolean {
  if (!editor || editor.isDestroyed) return false;
  const { from, to, empty } = editor.state.selection;
  const selected = empty ? "" : editor.state.doc.textBetween(from, to, " ").trim();
  let text = selected && selected !== inner ? `[[${inner}|${selected}]]` : `[[${inner}]]`;
  // Keep a space between the link and a word right before it.
  const before = from > 1 ? editor.state.doc.textBetween(from - 1, from, " ") : "";
  if (empty && /\S/.test(before) && !/[([{"'“]/.test(before)) text = " " + text;
  editor.chain().focus().insertContentAt({ from, to }, text).run();
  return true;
}

/** "Link to page" button with its dropdown. Also opens on Ctrl+K. */
export function LinkButton({ onPicked }: { onPicked: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("notesapp:link", show);
    return () => window.removeEventListener("notesapp:link", show);
  }, []);
  return (
    <span className="picker-anchor">
      <button
        onMouseDown={(e) => e.preventDefault() /* keep the cursor where it is in the text */}
        onClick={() => setOpen(!open)}
        title="Link to another page (Ctrl+K). Select text first to turn it into a link."
      >
        🔗 Link to page
      </button>
      {open && (
        <PagePicker
          onClose={() => setOpen(false)}
          onPick={(path) => {
            setOpen(false);
            onPicked(path);
          }}
        />
      )}
    </span>
  );
}
