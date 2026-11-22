import { useEffect, useRef, useState } from "react";
import { useNB } from "../context";
import { bridge } from "../lib/bridge";
import { isScalar } from "../lib/frontmatter";
import { linkLabel } from "../lib/links";
import { dirname } from "../lib/storage";
import { t } from "../lib/i18n";

interface Shown {
  target: string;
  path: string | null;
  left: number;
  top: number;
  above: boolean;
}

/** Plain text for a preview: no markdown symbols, links shown by name. */
function plain(md: string, hideSecrets: boolean): string {
  // Secret callouts never show while player-safe mode is on.
  if (hideSecrets) md = md.replace(/^\s*>\s*\[!secret\][^\n]*(\n\s*>[^\n]*)*/gim, "");
  return linkLabel(md.replace(/!\[\[[^\]]+\]\]/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, ""))
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^\s*>\s*\[![^\]]+\]\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/^\s*[-*]\s+\[[ x]\]\s*/gim, "• ")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\|.*\|$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Hover over a link, a link field or a map pin to see a short preview of the page, World Anvil style. */
export function HoverPreview() {
  const nb = useNB();
  const [shown, setShown] = useState<Shown | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const over = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-target], [data-preview]");
      if (el === current.current) return;
      current.current = el ?? null;
      window.clearTimeout(timer.current);
      if (!el) {
        timer.current = window.setTimeout(() => setShown(null), 150);
        return;
      }
      timer.current = window.setTimeout(() => {
        const target = (el as HTMLElement).dataset.target ?? (el as HTMLElement).dataset.preview ?? "";
        const r = el.getBoundingClientRect();
        const above = r.bottom + 260 > window.innerHeight;
        setShown({
          target,
          path: nb.index.resolve(target, bridge.currentPath),
          left: Math.min(Math.max(8, r.left), window.innerWidth - 348),
          top: above ? r.top - 8 : r.bottom + 8,
          above,
        });
      }, 450);
    };
    const away = () => {
      window.clearTimeout(timer.current);
      current.current = null;
      setShown(null);
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("mousedown", away);
    window.addEventListener("blur", away);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mousedown", away);
      window.removeEventListener("blur", away);
    };
  }, [nb.index]);

  const page = shown?.path ? nb.index.pages.get(shown.path) : undefined;
  useEffect(() => {
    setImg(null);
    if (!page?.image) return;
    let alive = true;
    bridge.imageUrl(page.image, page.path).then((u) => alive && setImg(u));
    return () => {
      alive = false;
    };
  }, [page?.path, page?.image]);

  if (!shown) return null;
  const style = { left: shown.left, top: shown.top, transform: shown.above ? "translateY(-100%)" : undefined };
  if (!page) {
    return (
      <div className="preview" style={style}>
        <strong>{shown.target}</strong>
        <p className="muted">{t("Not written yet. Click the link to create the page.")}</p>
      </div>
    );
  }
  const hidden = nb.playerSafe && page.secret;
  const card = nb.index.cards.get(page.path)?.[0];
  const type = card ? nb.config.cardTypes.find((c) => c.id === card.type) : undefined;
  const facts = card
    ? (type?.fields ?? [])
        .filter((f) => f.type !== "long" && !["name", "title", "secret"].includes(f.key))
        .map((f) => [f.label, card.data[f.key]] as const)
        .filter(([, v]) => (isScalar(v) && v !== "" && v !== null && v !== false) || (Array.isArray(v) && v.length))
        .slice(0, 5)
    : [];
  const text = plain(page.summary, nb.playerSafe).slice(0, 320);
  return (
    <div className="preview" style={{ ...style, ["--card" as string]: type?.color }}>
      {img && !hidden && <img src={img} alt="" />}
      <div className="preview-head">
        <strong>{card?.title ?? page.title}</strong>
        {type && <span className="card-label">{type.name}</span>}
        {page.ext === "map" && <span className="card-label">{t("Map")}</span>}
      </div>
      <div className="muted small">{dirname(page.path) || t("Loose pages")}</div>
      {hidden ? (
        <p className="muted">{t("Secret page (hidden in player-safe mode).")}</p>
      ) : (
        <>
          {facts.length > 0 && (
            <dl className="preview-facts">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{Array.isArray(v) ? v.map((x) => linkLabel(String(x))).join(", ") : v === true ? "✓" : linkLabel(String(v))}</dd>
                </div>
              ))}
            </dl>
          )}
          {text && <p className="preview-text">{text}{page.summary.length > 320 ? "…" : ""}</p>}
          {page.tags.length > 0 && <div className="preview-tags">{[...new Set(page.tags)].slice(0, 6).map((t) => `#${t}`).join("  ")}</div>}
        </>
      )}
    </div>
  );
}
