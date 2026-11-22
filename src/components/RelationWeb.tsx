import { useMemo, useState } from "react";
import { useNB } from "../context";
import type { CardRef } from "../lib/index";
import { singleLink } from "../lib/links";
import { t } from "../lib/i18n";

interface WebNode {
  id: string;
  label: string;
  x: number;
  y: number;
  card: boolean;
}
interface WebEdge {
  a: string;
  b: string;
  kind: "ally" | "enemy";
}

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? `[[${x.join("")}]]` : String(x))) : v ? [String(v)] : []);

/** Simple force layout: links pull, everyone pushes. Same input gives the same picture. */
export function layoutWeb(ids: string[], edges: WebEdge[], w = 900, h = 600): Map<string, { x: number; y: number }> {
  const pos = new Map(ids.map((id, i) => [id, { x: w / 2 + Math.cos((i / ids.length) * Math.PI * 2) * w * 0.35, y: h / 2 + Math.sin((i / ids.length) * Math.PI * 2) * h * 0.35 }]));
  const k = Math.sqrt((w * h) / Math.max(ids.length, 1)) * 0.6;
  for (let step = 0; step < 300; step++) {
    const temp = 40 * (1 - step / 300) + 1;
    const disp = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const p = pos.get(ids[i])!, q = pos.get(ids[j])!;
        const dx = p.x - q.x || 0.01, dy = p.y - q.y || 0.01;
        const d = Math.max(Math.hypot(dx, dy), 1);
        const f = (k * k) / d;
        const a = disp.get(ids[i])!, b = disp.get(ids[j])!;
        a.x += (dx / d) * f; a.y += (dy / d) * f;
        b.x -= (dx / d) * f; b.y -= (dy / d) * f;
      }
    for (const e of edges) {
      const p = pos.get(e.a)!, q = pos.get(e.b)!;
      const dx = p.x - q.x, dy = p.y - q.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const f = (d * d) / k;
      const a = disp.get(e.a)!, b = disp.get(e.b)!;
      a.x -= (dx / d) * f; a.y -= (dy / d) * f;
      b.x += (dx / d) * f; b.y += (dy / d) * f;
    }
    for (const id of ids) {
      const p = pos.get(id)!, d = disp.get(id)!;
      // A slight pull to the middle keeps loose groups on screen.
      d.x += (w / 2 - p.x) * 0.02; d.y += (h / 2 - p.y) * 0.02;
      const len = Math.max(Math.hypot(d.x, d.y), 0.01);
      p.x = Math.min(w - 60, Math.max(60, p.x + (d.x / len) * Math.min(len, temp)));
      p.y = Math.min(h - 30, Math.max(30, p.y + (d.y / len) * Math.min(len, temp)));
    }
  }
  return pos;
}

export function RelationWeb({ cards, allies, enemies }: { cards: CardRef[]; allies: string; enemies?: string }) {
  const nb = useNB();
  const [focus, setFocus] = useState<string | null>(null);
  const { nodes, edges } = useMemo(() => {
    const label = new Map<string, string>();
    const isCard = new Set<string>();
    const edges: WebEdge[] = [];
    const seen = new Set<string>();
    for (const c of cards) {
      label.set(c.path, c.title);
      isCard.add(c.path);
    }
    for (const c of cards)
      for (const [key, kind] of [[allies, "ally"], [enemies, "enemy"]] as const) {
        if (!key) continue;
        for (const v of listOf(c.data[key])) {
          const target = singleLink(v);
          const path = target ? nb.index.resolve(target, c.path) ?? `missing:${target}` : `name:${v}`;
          if (path === c.path) continue;
          if (!label.has(path)) label.set(path, nb.index.pages.get(path)?.title ?? (target || v));
          const id = [c.path, path].sort().join("|") + kind;
          if (seen.has(id)) continue;
          seen.add(id);
          edges.push({ a: c.path, b: path, kind });
        }
      }
    const used = new Set(edges.flatMap((e) => [e.a, e.b]));
    const ids = [...used].sort();
    const pos = layoutWeb(ids, edges);
    const nodes: WebNode[] = ids.map((id) => ({ id, label: label.get(id) ?? id, ...pos.get(id)!, card: isCard.has(id) }));
    return { nodes, edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, allies, enemies, nb.indexVer]);
  if (!edges.length) return <div className="page-message">{t("Nobody has allies or enemies yet. Open a card and add them with the + button; the web draws itself.")}</div>;
  const at = new Map(nodes.map((n) => [n.id, n]));
  const near = (id: string) => !focus || id === focus || edges.some((e) => (e.a === focus && e.b === id) || (e.b === focus && e.a === id));
  return (
    <div className="web-view">
      <div className="web-legend small">
        <span className="ally-line" /> {t("Allies")} <span className="enemy-line" /> {t("Enemies")} <span className="muted">· {t("Hover a name to see only its ties. Click to open.")}</span>
      </div>
      <svg viewBox="0 0 900 600" className="web-svg" role="img" aria-label={t("Relationship web")}>
        {edges.map((e, i) => {
          const a = at.get(e.a)!, b = at.get(e.b)!;
          const dim = focus && e.a !== focus && e.b !== focus;
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={"web-edge " + e.kind + (dim ? " dim" : "")} />;
        })}
        {nodes.map((n) => (
          <g
            key={n.id}
            className={"web-node" + (n.card ? "" : " other") + (near(n.id) ? "" : " dim")}
            transform={`translate(${n.x},${n.y})`}
            onMouseEnter={() => setFocus(n.id)}
            onMouseLeave={() => setFocus(null)}
            onClick={() => (n.id.includes(":") ? nb.notice(t("There is no page called “{0}” yet.", n.label)) : nb.openPath(n.id))}
            data-preview={n.id.includes(":") ? undefined : n.label}
          >
            <circle r={n.card ? 9 : 6} />
            <text y={-13} textAnchor="middle">
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
