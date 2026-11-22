import { useEffect, useState } from "react";
import { useNB } from "../context";
import { bridge } from "../lib/bridge";
import { coerce } from "../lib/cards";
import { linkLabel, singleLink } from "../lib/links";
import { PagePicker } from "./PagePicker";
import type { Data } from "../lib/frontmatter";
import type { CardType, FieldDef } from "../lib/kits";
import { t } from "../lib/i18n";
import { Lgr22Input } from "./Lgr22";

const asText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function FieldInput({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(asText(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(asText(value));
  }, [value, focused]);
  const commit = (t: string) => {
    setText(t);
    onChange(coerce(def, t));
  };
  const common = { onFocus: () => setFocused(true), onBlur: () => setFocused(false) };
  switch (def.type) {
    case "link":
      return <LinkInput def={def} value={value} onChange={onChange} />;
    case "links":
      return <LinksInput def={def} value={value} onChange={onChange} />;
    case "lgr22":
      return <Lgr22Input def={def} value={value} onChange={onChange} />;
    case "check":
      return <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case "select": {
      const opts = def.options ?? [];
      const extra = text && !opts.includes(text) ? [text] : [];
      return (
        <select value={text} onChange={(e) => commit(e.target.value)}>
          <option value="">–</option>
          {[...opts, ...extra].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    }
    case "long":
      return <textarea rows={2} value={text} {...common} onChange={(e) => commit(e.target.value)} />;
    case "date":
      return <input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ""} onChange={(e) => commit(e.target.value)} />;
    case "number":
      return <input inputMode="decimal" value={text} {...common} onChange={(e) => commit(e.target.value)} />;
    default:
      return <input value={text} {...common} onChange={(e) => commit(e.target.value)} />;
  }
}

/** A field that points at another page: shows the page as a link, picks it from a dropdown. */
function LinkInput({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const nb = useNB();
  const [open, setOpen] = useState(false);
  const text = asText(value);
  const target = singleLink(text);
  const hit = target ? nb.index.resolve(target, bridge.currentPath) : null;
  // A plain name from before the field was a link: offer to turn it into one.
  const plainHit = !target && text ? nb.index.resolve(text, bridge.currentPath) : null;
  return (
    <div className="link-field">
      {target ? (
        <button
          type="button"
          data-preview={target}
          className={"link-chip" + (hit ? "" : " missing")}
          title={hit ? t("Open {0}", hit) : t("This page does not exist yet. Click to create it.")}
          onClick={() => bridge.open(target, bridge.currentPath)}
        >
          {linkLabel(text)}
        </button>
      ) : text ? (
        <span className="link-plain" title={t("Not linked yet")}>
          {text}
          {plainHit && (
            <button type="button" className="quiet small" onClick={() => onChange(`[[${nb.index.linkTo(plainHit)}]]`)}>
              {t("link it")}
            </button>
          )}
        </span>
      ) : (
        <span className="muted link-none">–</span>
      )}
      <button type="button" className="link-pick" aria-label={t("Choose {0}", def.label)} title={t("Choose {0}", def.label.toLowerCase())} onClick={() => setOpen(!open)}>
        ▾
      </button>
      {open && (
        <PagePicker
          cardType={def.target || undefined}
          initial={target ? "" : text}
          onClose={() => setOpen(false)}
          onClear={text ? () => (onChange(""), setOpen(false)) : undefined}
          onPick={(path) => {
            onChange(`[[${nb.index.linkTo(path)}]]`);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Several page links, e.g. parents. Each is a chip; ▾ adds one. */
function LinksInput({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const nb = useNB();
  const [open, setOpen] = useState(false);
  const list = (Array.isArray(value) ? value : value ? [value] : []).map((v) => (Array.isArray(v) ? `[[${v.join("")}]]` : String(v)));
  return (
    <div className="link-field links-field">
      <span className="chips">
        {list.length === 0 && <span className="muted link-none">–</span>}
        {list.map((v, i) => {
          const target = singleLink(v);
          return (
            <span key={v + i} className="chip">
              {target ? (
                <button type="button" className="link-chip" data-preview={target} onClick={() => bridge.open(target, bridge.currentPath)}>
                  {linkLabel(v)}
                </button>
              ) : (
                <span>{v}</span>
              )}
              <button type="button" className="chip-x" aria-label={t("Remove {0}", linkLabel(v))} onClick={() => onChange(list.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          );
        })}
      </span>
      <button type="button" className="link-pick" aria-label={t("Add to {0}", def.label)} title={t("Add to {0}", def.label.toLowerCase())} onClick={() => setOpen(!open)}>
        +
      </button>
      {open && (
        <PagePicker
          cardType={def.target || undefined}
          onClose={() => setOpen(false)}
          onPick={(path) => {
            const v = `[[${nb.index.linkTo(path)}]]`;
            if (!list.includes(v)) onChange([...list, v]);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Form for a card's fields. Fields in the data but not in the card type are shown as plain text. */
export function CardFields({ type, data, onChange }: { type?: CardType; data: Data; onChange: (key: string, value: unknown) => void }) {
  const defs: FieldDef[] = type ? [...type.fields] : [];
  for (const key of Object.keys(data)) {
    if (key === "card" || key === "tags" || defs.some((d) => d.key === key)) continue;
    const v = data[key];
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) defs.push({ key, label: key, type: typeof v === "boolean" ? "check" : "text" });
  }
  return (
    <div className="card-fields">
      {defs.map((d) => (
        <label key={d.key} className={"field field-" + d.type}>
          <span>{d.label}</span>
          <FieldInput def={d} value={data[d.key]} onChange={(v) => onChange(d.key, v)} />
        </label>
      ))}
    </div>
  );
}
