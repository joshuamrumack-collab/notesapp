import { useMemo, useState } from "react";
import { useNB } from "../context";
import { t, t as tr } from "../lib/i18n";

/** Tags for the whole page. Click a tag to see every page with it. */
export function TagBar({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const nb = useNB();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const known = useMemo(
    () => [...nb.index.tags().keys()],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nb.indexVer],
  );
  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
    setText("");
  };
  return (
    <div className="tagbar">
      {tags.map((t) => (
        <span key={t} className="chip tag-chip">
          <button type="button" className="link" onClick={() => nb.openTag(t)}>
            #{t}
          </button>
          <button type="button" className="chip-x" aria-label={tr("Remove tag {0}", t)} onClick={() => onChange(tags.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <>
          <input
            autoFocus
            className="tag-input"
            list="known-tags"
            placeholder={t("tag")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(text);
              } else if (e.key === "Escape") setAdding(false);
            }}
            onBlur={() => {
              if (text) add(text);
              setAdding(false);
            }}
          />
          <datalist id="known-tags">
            {known.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </>
      ) : (
        <button type="button" className="quiet small" onClick={() => setAdding(true)}>
          {t("+ Tag")}
        </button>
      )}
    </div>
  );
}
