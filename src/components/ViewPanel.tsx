import { useMemo, useState } from "react";
import { useNB } from "../context";
import { updateCardField } from "../lib/cards";
import type { CardRef } from "../lib/index";
import type { FieldDef, ViewDef } from "../lib/kits";
import { dirname } from "../lib/storage";
import { linkLabel, singleLink } from "../lib/links";
import type { JSX } from "react";
import { t } from "../lib/i18n";
import { Coverage } from "./Lgr22";
import { RelationWeb } from "./RelationWeb";

/** A field value; a [[link]] becomes a clickable page name. */
function Value({ v, from }: { v: unknown; from: string }) {
  const nb = useNB();
  const target = singleLink(v);
  if (!target) return <>{show(v)}</>;
  return (
    <button className="link value-link" onClick={() => {
      const hit = nb.index.resolve(target, from);
      if (hit) nb.openPath(hit);
      else nb.notice(t("There is no page called “{0}” yet.", target));
    }}>
      {show(v)}
    </button>
  );
}

const raw = (v: unknown) =>
  v === true ? "✓" : v === false || v === null || v === undefined ? "" : Array.isArray(v) && v.some((x) => typeof x === "string" && x.includes("~")) ? t("{0} items", v.length) : Array.isArray(v) ? v.map(String).join(", ") : String(v);
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
  const anyType = view.cardType === "*";
  const type = anyType
    ? { id: "*", name: "", color: "", fields: nb.config.cardTypes.flatMap((c) => c.fields).filter((f, i, all) => all.findIndex((x) => x.key === f.key) === i) }
    : nb.config.cardTypes.find((c) => c.id === view.cardType);
  const [filter, setFilter] = useState("");
  const cards = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return nb.index
      .allCards()
      .filter((c) => (anyType ? view.field !== undefined && c.data[view.field] !== undefined && c.data[view.field] !== "" : c.type === view.cardType))
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
        <input className="view-filter" placeholder={t("Filter…")} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted small">
          {t("{0} {1} cards", cards.length, type.name)}
        </span>
      </header>
      <div className="view-body">
        {!cards.length && (
          <div className="page-message">
            {t("No {0} cards yet. Add one with + Card… → {0} on any page, or make a page a card from its properties.", type.name)}
          </div>
        )}
        {cards.length > 0 && view.kind === "table" && <CardTable cards={cards} fields={type.fields} />}
        {cards.length > 0 && view.kind === "board" && field && <Board cards={cards} field={field} onMove={(c, v) => setField(c, field.key, v)} titleFields={type.fields} />}
        {cards.length > 0 && view.kind === "schedule" && field && <Schedule cards={cards} field={field} fields={type.fields} />}
        {cards.length > 0 && view.kind === "timeline" && field && <Timeline cards={cards} field={field} era={view.field2} fields={type.fields} />}
        {cards.length > 0 && view.kind === "tree" && field && <FamilyTree cards={cards} parents={field.key} partner={view.field2} />}
        {cards.length > 0 && view.kind === "web" && field && <RelationWeb cards={cards} allies={field.key} enemies={view.field2} />}
        {cards.length > 0 && view.kind === "coverage" && field && <Coverage cards={cards} field={field.key} />}
        {cards.length > 0 && view.kind !== "table" && !field && <div className="page-message">{t("This view needs a field to group by. Set it in Notebook settings → Views.")}</div>}
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
          <th>{t("Page")}</th>
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
            <td className="muted">{dirname(c.path) || t("Loose pages")}</td>
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
            {linkLabel(col) || t("No {0}", field.label.toLowerCase())} <span className="muted">{values.filter((v) => v === col).length}</span>
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
    let label = t("No date");
    if (/^\d{4}-\d{2}-\d{2}$/.test(x.d)) {
      const { year, week } = isoWeek(new Date(x.d + "T12:00:00"));
      label = t("Week {0}, {1}", week, year);
    }
    groups.set(label, [...(groups.get(label) ?? []), x]);
  }
  const now = isoWeek(new Date());
  const thisWeek = t("Week {0}, {1}", now.week, now.year);
  const rest = fields.filter((f) => f.key !== field.key && f.type !== "long" && !["name", "title"].includes(f.key));
  return (
    <div className="schedule">
      {[...groups].map(([label, items]) => (
        <section key={label} className={"week" + (label === thisWeek ? " this-week" : "")}>
          <h3>
            {label}
            {label === thisWeek && <span className="tag">{t("this week")}</span>}
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


// ---------- timeline ----------

/** Something to sort by: a number, a date, or text that starts with a year ("1247 AR", "-300"). */
export function timeKey(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || !v.trim()) return null;
  const iso = /^(-?\d{1,6})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return Number(iso[1]) + (Number(iso[2]) - 1) / 12 + (Number(iso[3]) - 1) / 372;
  // "Frostmoon 3rd, 1247 AR": the year is the long number, not the day.
  const nums = [...v.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => m[0]);
  const year = nums.find((n) => n.replace("-", "").split(".")[0].length >= 3) ?? nums[0];
  return year !== undefined ? Number(year) : null;
}

function Timeline({ cards, field, era, fields }: { cards: CardRef[]; field: FieldDef; era?: string; fields: FieldDef[] }) {
  const items = cards
    .map((c) => ({ c, k: timeKey(c.data[field.key]) }))
    .filter((x): x is { c: CardRef; k: number } => x.k !== null)
    .sort((a, b) => a.k - b.k || a.c.title.localeCompare(b.c.title));
  const missing = cards.length - items.length;
  const rest = fields.filter((f) => ![field.key, era, "name", "title", "secret", "card"].includes(f.key) && f.type !== "long").slice(0, 4);
  let lastEra = "\0";
  return (
    <div className="timeline">
      {items.map(({ c }) => {
        const e = era ? show(c.data[era]) : "";
        const head = era && e !== lastEra ? <h3 className="era">{e || t("No era")}</h3> : null;
        lastEra = e;
        const when = c.data.when ?? c.data[field.key];
        return (
          <div key={c.path + (c.nodeId ?? "")}>
            {head}
            <div className="tl-item">
              <div className="tl-when">{show(when)}</div>
              <div className="tl-dot" />
              <div className="tl-body">
                <CardTitle card={c} />
                <div className="small">
                  {rest
                    .map((f) => [f, c.data[f.key]] as const)
                    .filter(([, v]) => (Array.isArray(v) ? v.length : show(v)))
                    .map(([f, v]) => (
                      <span key={f.key} className="tl-field">
                        <span className="muted">{f.label}:</span>{" "}
                        {Array.isArray(v) ? v.map((x, i) => <span key={i}>{i > 0 && ", "}<Value v={x} from={c.path} /></span>) : <Value v={v} from={c.path} />}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {missing > 0 && <p className="muted small">{t("{0} cards have no {1} and are not shown.", missing, field.label.toLowerCase())}</p>}
    </div>
  );
}

// ---------- family tree ----------

const BOX_W = 160;
const BOX_H = 52;
const GAP_X = 28;
const GAP_Y = 70;

function listOf(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr.map((x) => (Array.isArray(x) ? x.join("") : String(x))).map((x) => singleLink(x) ?? (x.trim() || "")).filter(Boolean);
}

export function layoutTree(people: { id: string; parents: string[]; partners: string[] }[]) {
  const ids = new Set(people.map((p) => p.id));
  const parentsOf = new Map(people.map((p) => [p.id, p.parents.filter((x) => ids.has(x) && x !== p.id)]));
  const partnersOf = new Map(people.map((p) => [p.id, new Set(p.partners.filter((x) => ids.has(x) && x !== p.id))]));
  for (const [id, set] of partnersOf) for (const o of set) partnersOf.get(o)?.add(id);
  // Generation: one below the lowest parent; partners share a row.
  const gen = new Map(people.map((p) => [p.id, 0]));
  for (let round = 0; round < people.length + 2; round++) {
    let changed = false;
    for (const p of people) {
      let g = gen.get(p.id)!;
      for (const par of parentsOf.get(p.id)!) g = Math.max(g, gen.get(par)! + 1);
      for (const o of partnersOf.get(p.id)!) g = Math.max(g, gen.get(o)!);
      if (g !== gen.get(p.id) && g < people.length + 1) {
        gen.set(p.id, g);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const rows = new Map<number, string[]>();
  for (const p of people) rows.set(gen.get(p.id)!, [...(rows.get(gen.get(p.id)!) ?? []), p.id]);
  const levels = [...rows.keys()].sort((a, b) => a - b);
  const x = new Map<string, number>();
  for (const lvl of levels) {
    let row = rows.get(lvl)!;
    // Order by the parents' position, then keep partners side by side.
    const score = (id: string) => {
      const ps = parentsOf.get(id)!.filter((p) => x.has(p));
      return ps.length ? ps.reduce((s, p) => s + x.get(p)!, 0) / ps.length : Number.MAX_SAFE_INTEGER / 2 + row.indexOf(id);
    };
    row = [...row].sort((a, b) => score(a) - score(b));
    const placed: string[] = [];
    for (const id of row) {
      if (placed.includes(id)) continue;
      placed.push(id);
      for (const o of partnersOf.get(id)!) if (row.includes(o) && !placed.includes(o)) placed.push(o);
    }
    placed.forEach((id, i) => x.set(id, i));
    rows.set(lvl, placed);
  }
  const width = Math.max(...[...rows.values()].map((r) => r.length));
  const pos = new Map<string, { x: number; y: number }>();
  levels.forEach((lvl, li) => {
    const row = rows.get(lvl)!;
    const offset = ((width - row.length) * (BOX_W + GAP_X)) / 2;
    row.forEach((id, i) => pos.set(id, { x: offset + i * (BOX_W + GAP_X), y: li * (BOX_H + GAP_Y) }));
  });
  return { pos, parentsOf, partnersOf, width: width * (BOX_W + GAP_X), height: levels.length * (BOX_H + GAP_Y) };
}

function FamilyTree({ cards, parents, partner }: { cards: CardRef[]; parents: string; partner?: string }) {
  const nb = useNB();
  const byPath = new Map<string, CardRef>();
  for (const c of cards) if (!byPath.has(c.path)) byPath.set(c.path, c);
  const people = [...byPath.values()].map((c) => ({
    id: c.path,
    parents: listOf(c.data[parents]).map((t) => nb.index.resolve(t, c.path) ?? "").filter(Boolean),
    partners: partner ? listOf(c.data[partner]).map((t) => nb.index.resolve(t, c.path) ?? "").filter(Boolean) : [],
  }));
  const linked = new Set<string>();
  for (const p of people) {
    if (p.parents.length || p.partners.length) linked.add(p.id);
    for (const x of [...p.parents, ...p.partners]) if (byPath.has(x)) linked.add(x);
  }
  const inTree = people.filter((p) => linked.has(p.id));
  const alone = people.length - inTree.length;
  if (!inTree.length)
    return (
      <div className="page-message">
        {t("Nobody has family links yet. Open a character card and add Parents or Partner with the + button; the tree draws itself.")}
      </div>
    );
  const { pos, parentsOf, partnersOf, width, height } = layoutTree(inTree);
  const lines: JSX.Element[] = [];
  const seen = new Set<string>();
  for (const p of inTree) {
    const a = pos.get(p.id)!;
    for (const o of partnersOf.get(p.id)!) {
      const key = [p.id, o].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const b = pos.get(o);
      if (b) lines.push(<line key={key} x1={a.x + BOX_W / 2} y1={a.y + BOX_H / 2} x2={b.x + BOX_W / 2} y2={b.y + BOX_H / 2} className="tree-partner" />);
    }
    const ps = parentsOf.get(p.id)!.map((x) => pos.get(x)).filter(Boolean) as { x: number; y: number }[];
    if (ps.length) {
      const px = ps.reduce((s, q) => s + q.x + BOX_W / 2, 0) / ps.length;
      const py = Math.max(...ps.map((q) => q.y)) + BOX_H;
      const cx = a.x + BOX_W / 2;
      const mid = py + GAP_Y / 2;
      lines.push(<path key={p.id + "^"} d={`M${px},${py} V${mid} H${cx} V${a.y}`} className="tree-child" />);
    }
  }
  return (
    <div className="tree-wrap" style={{ width: width + 20, height: height + 40 }}>
      <svg width={width} height={height} className="tree-svg">
        {lines}
      </svg>
      {inTree.map((p) => {
        const c = byPath.get(p.id)!;
        const at = pos.get(p.id)!;
        const born = c.data.born;
        return (
          <button
            key={p.id}
            className={"tree-box" + (c.data.secret === true ? " secret" : "")}
            style={{ left: at.x, top: at.y, width: BOX_W, height: BOX_H }}
            data-preview={nb.index.linkTo(p.id)}
            onClick={() => nb.openPath(p.id)}
          >
            <strong>{c.title}</strong>
            <span className="muted small">{[show(c.data.race), born !== undefined && born !== "" ? `b. ${show(born)}` : ""].filter(Boolean).join(" · ")}</span>
          </button>
        );
      })}
      {alone > 0 && <p className="muted small tree-note">{t("{0} more without family links are not shown.", alone)}</p>}
    </div>
  );
}
