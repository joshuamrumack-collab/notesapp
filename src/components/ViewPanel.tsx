import { useMemo, useState } from "react";
import { useNB } from "../context";
import { updateCardField } from "../lib/cards";
import type { CardRef } from "../lib/index";
import type { FieldDef, ViewDef } from "../lib/kits";
import { dirname } from "../lib/storage";
import { linkLabel, singleLink } from "../lib/links";

/** A field value; a [[link]] becomes a clickable page name. */
function Value({ v, from }: { v: unknown; from: string }) {
  const nb = useNB();
  const target = singleLink(v);
  if (!target) return <>{show(v)}</>;
  return (
    <button className="link value-link" onClick={() => {
      const hit = nb.index.resolve(target, from);
      if (hit) nb.openPath(hit);
      else nb.notice(`There is no page called “${target}” yet.`);
    }}>
      {show(v)}
    </button>
  );
}

const raw = (v: unknown) => (v === true ? "✓" : v === false || v === null || v === undefined ? "" : String(v));
const show = (v: unknown) => linkLabel(raw(v));

function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7) };
}

export function ViewPanel({ view }: { view: ViewDef }) {
  const nb = useNB();
  const type = nb.config.cardTypes.find((c) => c.id === view.cardType);
  const [filter, setFilter] = useState("");
  const cards = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return nb.index
      .allCards()
      .filter((c) => c.type === view.cardType)
      .filter((c) => !(nb.playerSafe && (c.data.secret === true || nb.index.pages.get(c.path)?.secret)))
      .filter((c) => !q || [c.title, ...Object.values(c.data).map(show)].some((v) => v.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nb.indexVer, view.cardType, filter, nb.playerSafe]);

  const setField = async (card: CardRef, key: string, value: unknown) => {
    try {
      const content = await updateCardField(nb.store, card, key, value);
      nb.changed(card.path, content);
    } catch (e) {
      nb.notice(e instanceof Error ? e.message : String(e));
    }
  };

  if (!type) return <div className="page-message">This view uses a card type ({view.cardType}) that is not in this notebook any more.</div>;
  const field = type.fields.find((f) => f.key === view.field);

  return (
    <div className="view">
      <header className="page-header">
        <h1 className="view-title">{view.name}</h1>
        <input className="view-filter" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted small">
          {cards.length} {type.name} {cards.length === 1 ? "card" : "cards"}
        </span>
      </header>
      <div className="view-body">
        {!cards.length && (
          <div className="page-message">
            No {type.name} cards yet. Add one with <b>+ Card… → {type.name}</b> on any page, or make a page a card from its properties.
          </div>
        )}
        {cards.length > 0 && view.kind === "table" && <CardTable cards={cards} fields={type.fields} />}
        {cards.length > 0 && view.kind === "board" && field && <Board cards={cards} field={field} onMove={(c, v) => setField(c, field.key, v)} titleFields={type.fields} />}
        {cards.length > 0 && view.kind === "schedule" && field && <Schedule cards={cards} field={field} fields={type.fields} />}
        {cards.length > 0 && view.kind !== "table" && !field && <div className="page-message">This view needs a field to group by. Set it in Notebook settings → Views.</div>}
      </div>
    </div>
  );
}

function CardTitle({ card }: { card: CardRef }) {
  const nb = useNB();
  return (
    <button className="link card-open" onClick={() => nb.openPath(card.path)} title={card.path}>
      {card.title}
    </button>
  );
}

function CardTable({ cards, fields }: { cards: CardRef[]; fields: FieldDef[] }) {
  const cols = fields.filter((f) => f.type !== "long" && !["name", "title"].includes(f.key)).slice(0, 10);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "", dir: 1 });
  const rows = [...cards].sort((a, b) => {
    const av = sort.key ? show(a.data[sort.key]) : a.title;
    const bv = sort.key ? show(b.data[sort.key]) : b.title;
    return sort.dir * av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
  });
  const head = (key: string, label: string) => (
    <th key={key || "title"}>
      <button className="th-btn" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
  return (
    <table className="view-table">
      <thead>
        <tr>
          {head("", "Name")}
          {cols.map((c) => head(c.key, c.label))}
          <th>Page</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.path + (c.nodeId ?? "")}>
            <td>
              <CardTitle card={c} />
            </td>
            {cols.map((f) => (
              <td key={f.key}>
                <Value v={c.data[f.key]} from={c.path} />
              </td>
            ))}
            <td className="muted">{dirname(c.path) || "Loose pages"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tile({ card, fields }: { card: CardRef; fields: FieldDef[] }) {
  const extra = fields.filter((f) => f.type !== "long" && !["name", "title"].includes(f.key) && show(card.data[f.key])).slice(0, 3);
  return (
    <>
      <CardTitle card={card} />
      {extra.map((f) => (
        <div key={f.key} className="tile-field">
          <span className="muted">{f.label}:</span> <Value v={card.data[f.key]} from={card.path} />
        </div>
      ))}
    </>
  );
}

function Board({ cards, field, onMove, titleFields }: { cards: CardRef[]; field: FieldDef; onMove: (c: CardRef, v: string) => void; titleFields: FieldDef[] }) {
  const [over, setOver] = useState<string | null>(null);
  const values = cards.map((c) => raw(c.data[field.key]));
  const cols = [...new Set([...(field.type === "select" ? (field.options ?? []) : []), ...values.filter(Boolean).sort((a, b) => linkLabel(a).localeCompare(linkLabel(b)))])];
  if (values.some((v) => !v)) cols.push("");
  const fields = titleFields.filter((f) => f.key !== field.key);
  return (
    <div className="board">
      {cols.map((col) => (
        <div
          key={col || "(none)"}
          className={"board-col" + (over === col ? " over" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(col);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const id = e.dataTransfer.getData("text/x-card");
            const card = cards.find((c) => c.path + "|" + (c.nodeId ?? "") === id);
            if (card && raw(card.data[field.key]) !== col) onMove(card, col);
          }}
        >
          <div className="board-head">
            {linkLabel(col) || `No ${field.label.toLowerCase()}`} <span className="muted">{values.filter((v) => v === col).length}</span>
          </div>
          {cards
            .filter((c) => raw(c.data[field.key]) === col)
            .map((c) => (
              <div key={c.path + (c.nodeId ?? "")} className="tile" draggable onDragStart={(e) => e.dataTransfer.setData("text/x-card", c.path + "|" + (c.nodeId ?? ""))}>
                <Tile card={c} fields={fields} />
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function Schedule({ cards, field, fields }: { cards: CardRef[]; field: FieldDef; fields: FieldDef[] }) {
  const dated = cards
    .map((c) => ({ c, d: show(c.data[field.key]) }))
    .sort((a, b) => (a.d || "9999").localeCompare(b.d || "9999") || a.c.title.localeCompare(b.c.title));
  const groups = new Map<string, typeof dated>();
  for (const x of dated) {
    let label = "No date";
    if (/^\d{4}-\d{2}-\d{2}$/.test(x.d)) {
      const { year, week } = isoWeek(new Date(x.d + "T12:00:00"));
      label = `Week ${week}, ${year}`;
    }
    groups.set(label, [...(groups.get(label) ?? []), x]);
  }
  const now = isoWeek(new Date());
  const thisWeek = `Week ${now.week}, ${now.year}`;
  const rest = fields.filter((f) => f.key !== field.key && f.type !== "long" && !["name", "title"].includes(f.key));
  return (
    <div className="schedule">
      {[...groups].map(([label, items]) => (
        <section key={label} className={"week" + (label === thisWeek ? " this-week" : "")}>
          <h3>
            {label}
            {label === thisWeek && <span className="tag">this week</span>}
          </h3>
          {items.map(({ c, d }) => (
            <div key={c.path + (c.nodeId ?? "")} className="week-row">
              <span className="week-date">{d ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : ""}</span>
              <CardTitle card={c} />
              <span className="muted">{rest.map((f) => show(c.data[f.key])).filter(Boolean).join(" · ")}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
