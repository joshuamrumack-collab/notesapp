import { useEffect, useMemo, useState } from "react";
import { useNB } from "../context";
import { type Roll, roll } from "../lib/dice";
import { t } from "../lib/i18n";

const history: Roll[] = [];

export function DiceRoller() {
  const [expr, setExpr] = useState("d20");
  const [log, setLog] = useState<Roll[]>(history);
  const [error, setError] = useState("");
  const go = (e: string) => {
    try {
      const r = roll(e);
      history.unshift(r);
      history.splice(50);
      setLog([...history]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <div className="view">
      <header className="page-header">
        <h1 className="view-title">{t("Dice")}</h1>
      </header>
      <div className="view-body tool">
        <form
          className="dice-form"
          onSubmit={(e) => {
            e.preventDefault();
            go(expr);
          }}
        >
          <input value={expr} onChange={(e) => setExpr(e.target.value)} aria-label={t("Dice to roll")} autoFocus />
          <button className="primary">{t("Roll")}</button>
        </form>
        <div className="dice-quick">
          {["d4", "d6", "d8", "d10", "d12", "d20", "d100", "2d20kh1", "2d20kl1", "4d6kh3"].map((d) => (
            <button key={d} onClick={() => go(d)} title={d.includes("kh1") ? t("Advantage") : d.includes("kl1") ? t("Disadvantage") : d === "4d6kh3" ? t("Ability score") : ""}>
              {d}
            </button>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        <p className="muted small">{t("Examples: 2d6+3, d20-1, 4d6kh3 (keep highest 3), 2d20kl1 (keep lowest).")}</p>
        <div className="dice-log">
          {log.map((r, i) => (
            <div key={log.length - i} className={"dice-row" + (i === 0 ? " latest" : "")}>
              <span className="dice-total">{r.total}</span>
              <span className="dice-expr">{r.expr}</span>
              <span className="muted">{r.detail.replace(/~(\d+)~/g, "($1)")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface Combatant {
  id: string;
  name: string;
  mod: number;
  init: number | null;
  hp: string;
  note: string;
}
interface Tracker {
  round: number;
  turn: number;
  list: Combatant[];
}
const FILE = ".notesapp/initiative.json";
const uid = () => Math.random().toString(36).slice(2, 9);

export function Initiative() {
  const nb = useNB();
  const [tr, setT] = useState<Tracker | null>(null);
  useEffect(() => {
    nb.store.readText(FILE).then(
      (s) => setT(JSON.parse(s) as Tracker),
      () => setT({ round: 1, turn: 0, list: [] }),
    );
  }, [nb.store]);
  const save = (next: Tracker) => {
    setT(next);
    nb.store.writeText(FILE, JSON.stringify(next, null, "\tr") + "\n").catch((e) => nb.notice(String(e)));
  };
  const fromCards = useMemo(
    () => nb.index.allCards().filter((c) => c.data.initiative !== undefined || c.type === "npc" || c.type === "monster"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nb.indexVer],
  );
  if (!tr) return <div className="page-message">{t("Loading…")}</div>;
  const set = (id: string, p: Partial<Combatant>) => save({ ...tr, list: tr.list.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const sorted = (list: Combatant[]) => [...list].sort((a, b) => (b.init ?? -99) - (a.init ?? -99) || b.mod - a.mod);
  const add = (name: string, mod = 0, hp = "") => save({ ...tr, list: [...tr.list, { id: uid(), name, mod, init: null, hp, note: "" }] });
  return (
    <div className="view">
      <header className="page-header">
        <h1 className="view-title">{t("Initiative")}</h1>
        <span className="muted">Round {tr.round}</span>
      </header>
      <div className="view-body tool">
        <div className="init-actions">
          <button onClick={() => save({ ...tr, list: sorted(tr.list.map((c) => ({ ...c, init: roll(`d20${c.mod >= 0 ? "+" : ""}${c.mod}`).total }))), turn: 0, round: 1 })}>
            {t("Roll all")}
          </button>
          <button onClick={() => save({ ...tr, list: sorted(tr.list) })}>{t("Sort")}</button>
          <button
            className="primary"
            disabled={!tr.list.length}
            onClick={() => {
              const next = tr.turn + 1;
              save(next >= tr.list.length ? { ...tr, turn: 0, round: tr.round + 1 } : { ...tr, turn: next });
            }}
          >
            {t("Next turn")}
          </button>
          <button onClick={() => save({ round: 1, turn: 0, list: [] })}>{t("Clear")}</button>
          <select
            value=""
            aria-label={t("Add from a card")}
            onChange={(e) => {
              const c = fromCards.find((x) => x.path + (x.nodeId ?? "") === e.target.value);
              if (c) add(c.title, Number(c.data.initiative) || 0, c.data.hp !== undefined ? String(c.data.hp) : "");
            }}
          >
            <option value="">{t("+ From card…")}</option>
            {fromCards.map((c) => (
              <option key={c.path + (c.nodeId ?? "")} value={c.path + (c.nodeId ?? "")}>
                {c.title}
              </option>
            ))}
          </select>
          <button onClick={() => add(t("Combatant {0}", tr.list.length + 1))}>{t("+ Row")}</button>
        </div>
        <table className="view-table init-table">
          <thead>
            <tr>
              <th>{t("Init")}</th>
              <th>{t("Name")}</th>
              <th>{t("Mod")}</th>
              <th>{t("HP")}</th>
              <th>{t("Note")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tr.list.map((c, i) => (
              <tr key={c.id} className={i === tr.turn ? "current" : ""}>
                <td>
                  <input className="num" value={c.init ?? ""} onChange={(e) => set(c.id, { init: e.target.value === "" ? null : Number(e.target.value) || 0 })} aria-label={t("Initiative")} />
                </td>
                <td>
                  <input value={c.name} onChange={(e) => set(c.id, { name: e.target.value })} aria-label={t("Name")} />
                </td>
                <td>
                  <input className="num" value={c.mod} onChange={(e) => set(c.id, { mod: Number(e.target.value) || 0 })} aria-label={t("Initiative bonus")} />
                </td>
                <td>
                  <input className="num" value={c.hp} onChange={(e) => set(c.id, { hp: e.target.value })} aria-label={t("Hit points")} />
                </td>
                <td>
                  <input value={c.note} onChange={(e) => set(c.id, { note: e.target.value })} aria-label={t("Note")} />
                </td>
                <td>
                  <button className="quiet" onClick={() => save({ ...tr, list: tr.list.filter((x) => x.id !== c.id), turn: Math.min(tr.turn, Math.max(0, tr.list.length - 2)) })} aria-label={t("Remove")}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tr.list.length && <p className="muted">{t("Add combatants with + Row, or pick NPCs and monsters from your cards.")}</p>}
      </div>
    </div>
  );
}
