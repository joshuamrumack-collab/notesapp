import { useEffect, useMemo, useState } from "react";
import { useNB } from "../context";
import { type Catalog, loadCatalog, planLabel, planOf, shortText } from "../lib/lgr22";
import type { CardRef } from "../lib/index";
import type { FieldDef } from "../lib/kits";
import { Modal } from "./Modal";
import { t } from "../lib/i18n";

let cached: Catalog | null = null;
export function useCatalog(): { cat: Catalog | null; error: string } {
  const [cat, setCat] = useState<Catalog | null>(cached);
  const [error, setError] = useState("");
  useEffect(() => {
    if (cached) return;
    loadCatalog()
      .then((c) => setCat((cached = c)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return { cat, error };
}

export const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
const LAST = "notesapp.lgr22.plan";

/** Central content from Lgr22 for a card: chips, and + opens a tick list for one subject. */
export function Lgr22Input({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const { cat } = useCatalog();
  const [open, setOpen] = useState(false);
  const list = asIds(value);
  return (
    <div className="link-field links-field lgr22-field">
      <span className="chips">
        {list.length === 0 && <span className="muted link-none">–</span>}
        {list.map((id) => {
          const hit = cat?.items.get(id);
          return (
            <span key={id} className="chip lgr22-chip" title={hit ? `${planLabel(hit.plan)} · ${hit.area.name}\n${hit.item.text}` : id}>
              <span>{hit ? shortText(hit.item.text) : id}</span>
              <button type="button" className="chip-x" aria-label={t("Remove {0}", hit?.item.text ?? id)} onClick={() => onChange(list.filter((x) => x !== id))}>
                ×
              </button>
            </span>
          );
        })}
      </span>
      <button type="button" className="link-pick" aria-label={t("Add to {0}", def.label)} title={t("Choose central content from Lgr22")} onClick={() => setOpen(true)}>
        +
      </button>
      {open && <Lgr22Picker chosen={list} onClose={() => setOpen(false)} onChange={onChange} />}
    </div>
  );
}

function Lgr22Picker({ chosen, onChange, onClose }: { chosen: string[]; onChange: (v: string[]) => void; onClose: () => void }) {
  const { cat, error } = useCatalog();
  const [ticked, setTicked] = useState<string[]>(chosen);
  const [planId, setPlanId] = useState(() => (chosen[0] ? planOf(chosen[0]) : localStorage.getItem(LAST) ?? ""));
  const [q, setQ] = useState("");
  const [form, setForm] = useState("GR");
  const plans = useMemo(() => (cat ? [...cat.plans.values()] : []), [cat]);
  const forms = useMemo(() => [...new Map(plans.map((p) => [p.form, p.formName])).entries()], [plans]);
  const plan = cat?.plans.get(planId);
  useEffect(() => {
    if (plan) setForm(plan.form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);
  const shown = plans.filter((p) => p.form === form && (!q || planLabel(p).toLowerCase().includes(q.toLowerCase())));
  const toggle = (id: string) => setTicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return (
    <Modal title={t("Central content (Lgr22)")} onClose={onClose} wide>
      {error && <p className="error">{t(error)}</p>}
      {!cat && !error && <p className="muted">{t("Loading…")}</p>}
      {cat && (
        <div className="lgr22-picker">
          <div className="lgr22-plans">
            <select value={form} onChange={(e) => setForm(e.target.value)} aria-label={t("School form")}>
              {forms.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <input placeholder={t("Find a subject…")} value={q} onChange={(e) => setQ(e.target.value)} />
            <ul>
              {shown.map((p) => (
                <li key={p.id}>
                  <button className={p.id === planId ? "selected" : ""} onClick={() => (setPlanId(p.id), localStorage.setItem(LAST, p.id))}>
                    {planLabel(p)}
                    {ticked.some((x) => planOf(x) === p.id) && <span className="count">{ticked.filter((x) => planOf(x) === p.id).length}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="lgr22-items">
            {!plan && <p className="muted">{t("Pick a subject on the left.")}</p>}
            {plan?.areas.map((a) => (
              <section key={a.id}>
                <h3>{a.name}</h3>
                {a.items.map((it) => (
                  <label key={it.id} className="lgr22-item">
                    <input type="checkbox" checked={ticked.includes(it.id)} onChange={() => toggle(it.id)} />
                    <span>{it.text}</span>
                  </label>
                ))}
              </section>
            ))}
          </div>
        </div>
      )}
      <div className="actions">
        <span className="muted small">
          {t("{0} chosen", ticked.length)} · {t("Source: Skolverket")}
        </span>
        <button onClick={onClose}>{t("Cancel")}</button>
        <button className="primary" onClick={() => (onChange(ticked), onClose())}>
          {t("Done")}
        </button>
      </div>
    </Modal>
  );
}

/** Which central content the cards cover, per subject: covered items list their cards, gaps stand out. */
export function Coverage({ cards, field }: { cards: CardRef[]; field: string }) {
  const nb = useNB();
  const { cat, error } = useCatalog();
  const [gapsOnly, setGapsOnly] = useState(false);
  const by = new Map<string, CardRef[]>();
  for (const c of cards) for (const id of asIds(c.data[field])) by.set(id, [...(by.get(id) ?? []), c]);
  const planIds = [...new Set([...by.keys()].map(planOf))];
  const [planId, setPlanId] = useState(planIds[0] ?? "");
  if (error) return <div className="page-message">{t(error)}</div>;
  if (!cat) return <div className="page-message">{t("Loading…")}</div>;
  if (!planIds.length) return <div className="page-message">{t("No cards have central content yet. Open a card and press + by {0}.", field)}</div>;
  const plan = cat.plans.get(planIds.includes(planId) ? planId : planIds[0]);
  if (!plan) return <div className="page-message">{planId}</div>;
  const all = plan.areas.flatMap((a) => a.items);
  const covered = all.filter((i) => by.has(i.id)).length;
  return (
    <div className="coverage">
      <div className="coverage-head">
        <select value={plan.id} onChange={(e) => setPlanId(e.target.value)} aria-label={t("Subject")}>
          {planIds.map((id) => (
            <option key={id} value={id}>
              {cat.plans.get(id) ? planLabel(cat.plans.get(id)!) : id}
            </option>
          ))}
        </select>
        <meter min={0} max={all.length} value={covered} />
        <span>{t("{0} of {1} items covered", covered, all.length)}</span>
        <label className="small">
          <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} /> {t("Only show gaps")}
        </label>
      </div>
      {plan.areas.map((a) => {
        const items = a.items.filter((i) => !gapsOnly || !by.has(i.id));
        if (!items.length) return null;
        return (
          <section key={a.id}>
            <h3>
              {a.name} <span className="muted small">{t("{0} of {1}", a.items.filter((i) => by.has(i.id)).length, a.items.length)}</span>
            </h3>
            <ul className="coverage-list">
              {items.map((i) => {
                const hits = by.get(i.id) ?? [];
                return (
                  <li key={i.id} className={hits.length ? "covered" : "gap"}>
                    <span className="coverage-mark">{hits.length ? "✓" : "○"}</span>
                    <span className="coverage-text">{i.text}</span>
                    <span className="coverage-cards">
                      {hits.map((c) => (
                        <button key={c.path + (c.nodeId ?? "")} className="link small" onClick={() => nb.openPath(c.path)}>
                          {c.title}
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="muted small">{t("Central content from Skolverket, the same list Lärarbordet uses.")}</p>
    </div>
  );
}
