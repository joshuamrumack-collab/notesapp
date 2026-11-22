import { type ReactNode, useMemo, useState } from "react";
import { useNB } from "../context";
import { DiceRoller, Initiative } from "./Tools";
import { PagePicker } from "./PagePicker";
import { t } from "../lib/i18n";

const KEY = "notesapp.session.page";

/** Game master screen: tonight's session page, initiative, dice and a quick look-up side by side. */
export function SessionScreen({ renderPage }: { renderPage: (path: string) => ReactNode }) {
  const nb = useNB();
  const sessions = useMemo(
    () =>
      nb.index
        .allCards()
        .filter((c) => c.type === "session")
        .sort((a, b) => String(b.data.date ?? "").localeCompare(String(a.data.date ?? "")) || Number(b.data.number ?? 0) - Number(a.data.number ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nb.indexVer],
  );
  const [path, setPath] = useState<string>(() => {
    const saved = localStorage.getItem(KEY);
    return saved && nb.index.pages.has(saved) ? saved : (sessions[0]?.path ?? "");
  });
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [look, setLook] = useState<string | null>(null);
  const hits = q.trim() ? nb.index.search(q, 12).filter((r) => !(nb.playerSafe && nb.index.pages.get(r.path)?.secret)) : [];
  const choose = (p: string) => {
    setPath(p);
    localStorage.setItem(KEY, p);
  };
  const info = look ? nb.index.pages.get(look) : undefined;
  const card = look ? nb.index.allCards().find((c) => c.path === look && !c.nodeId) : undefined;
  return (
    <div className="session-screen">
      <div className="session-main">
        <div className="session-bar">
          <select value={path} onChange={(e) => (e.target.value === "?" ? setPicking(true) : choose(e.target.value))} aria-label={t("Session page")}>
            {!path && <option value="">{t("Choose the session page…")}</option>}
            {sessions.map((s) => (
              <option key={s.path + (s.nodeId ?? "")} value={s.path}>
                {s.title}
                {s.data.date ? ` · ${s.data.date}` : ""}
              </option>
            ))}
            {path && !sessions.some((s) => s.path === path) && <option value={path}>{nb.index.pages.get(path)?.title ?? path}</option>}
            <option value="?">{t("Another page…")}</option>
          </select>
          {path && (
            <button className="quiet" onClick={() => nb.openPath(path)}>
              {t("Open as normal page")}
            </button>
          )}
        </div>
        {picking && <PagePicker onClose={() => setPicking(false)} onPick={(p) => (choose(p), setPicking(false))} />}
        <div className="session-page">{path ? renderPage(path) : <div className="page-message">{t("No session pages yet. Make one with New from template → Session log, then come back.")}</div>}</div>
      </div>
      <div className="session-side">
        <div className="session-panel">
          <input type="search" placeholder={t("Look something up…")} value={q} onChange={(e) => (setQ(e.target.value), setLook(null))} />
          {!look &&
            hits.map((h) => (
              <button key={h.path} className="session-hit" onClick={() => setLook(h.path)}>
                <b>{h.title}</b>
                <span className="muted small">{h.snippet}</span>
              </button>
            ))}
          {look && info && (
            <div className="session-look">
              <div className="row">
                <button className="quiet small" onClick={() => setLook(null)}>
                  ← {t("Back")}
                </button>
                <b>{info.title}</b>
                <button className="quiet small" onClick={() => choose(look)} title={t("Show it in the big panel")}>
                  ⇱
                </button>
              </div>
              {card && (
                <table className="session-fields">
                  <tbody>
                    {Object.entries(card.data)
                      .filter(([k, v]) => !["card", "tags", "secret"].includes(k) && v !== "" && v !== null && !(Array.isArray(v) && !v.length))
                      .slice(0, 14)
                      .map(([k, v]) => (
                        <tr key={k}>
                          <th>{nb.config.cardTypes.find((c) => c.id === card.type)?.fields.find((f) => f.key === k)?.label ?? k}</th>
                          <td>{(Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? x.join("") : String(x))) : [String(v)]).join(", ").replace(/\[\[|\]\]/g, "")}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              <p className="session-summary">{info.summary.slice(0, 900)}</p>
            </div>
          )}
        </div>
        <div className="session-panel">
          <Initiative />
        </div>
        <div className="session-panel">
          <DiceRoller />
        </div>
      </div>
    </div>
  );
}
