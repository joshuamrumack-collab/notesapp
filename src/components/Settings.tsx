import { useState } from "react";
import { useNB } from "../context";
import type { CardType, FieldDef, FieldType, ToolId, ViewDef, ViewKind } from "../lib/kits";
import { type NotebookConfig, exportKit, rememberKit } from "../lib/notebook";
import { Modal } from "./Modal";
import { checkForUpdates, useAppVersion } from "./Updates";
import { isTauri } from "../lib/storage";

const FIELD_TYPES: FieldType[] = ["text", "number", "select", "date", "long", "check", "link", "links"];
const TOOLS: { id: ToolId; label: string }[] = [
  { id: "dice", label: "Dice roller" },
  { id: "initiative", label: "Initiative tracker" },
  { id: "player-safe", label: "Player-safe mode" },
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function Settings({ onClose, onSave, onAddKit }: { onClose: () => void; onSave: (c: NotebookConfig) => Promise<void>; onAddKit: () => void }) {
  const nb = useNB();
  const [c, setC] = useState<NotebookConfig>(structuredClone(nb.config));
  const [tab, setTab] = useState<"cards" | "views" | "general" | "share">("cards");
  const [typeIdx, setTypeIdx] = useState(0);
  const [kitName, setKitName] = useState(nb.config.kitName ? `${nb.config.kitName} (mine)` : `${nb.store.rootName} kit`);
  const [kitDesc, setKitDesc] = useState("");
  const [msg, setMsg] = useState("");
  const type = c.cardTypes[typeIdx];
  const version = useAppVersion();

  const setType = (p: Partial<CardType>) => setC({ ...c, cardTypes: c.cardTypes.map((t, i) => (i === typeIdx ? { ...t, ...p } : t)) });
  const setField = (fi: number, p: Partial<FieldDef>) => setType({ fields: type.fields.map((f, i) => (i === fi ? { ...f, ...p } : f)) });
  const setView = (vi: number, p: Partial<ViewDef>) => setC({ ...c, views: c.views.map((v, i) => (i === vi ? { ...v, ...p } : v)) });

  return (
    <Modal title="Notebook settings" onClose={onClose} wide>
      <div className="tabs">
        {(["cards", "views", "general", "share"] as const).map((t) => (
          <button key={t} className={tab === t ? "selected" : ""} onClick={() => setTab(t)}>
            {{ cards: "Card types", views: "Views", general: "Kit and tools", share: "Save as kit" }[t]}
          </button>
        ))}
      </div>

      {tab === "cards" && (
        <div className="settings-cards">
          <div className="type-list">
            {c.cardTypes.map((t, i) => (
              <button key={t.id + i} className={i === typeIdx ? "selected" : ""} onClick={() => setTypeIdx(i)}>
                <span className="swatch" style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
            <button
              onClick={() => {
                const n = c.cardTypes.length + 1;
                setC({ ...c, cardTypes: [...c.cardTypes, { id: `card-${n}`, name: `New card ${n}`, color: "#4a6fa5", fields: [{ key: "name", label: "Name", type: "text" }] }] });
                setTypeIdx(c.cardTypes.length);
              }}
            >
              + Card type
            </button>
          </div>
          {type ? (
            <div className="type-edit form">
              <div className="row">
                <label>
                  Name
                  <input value={type.name} onChange={(e) => setType({ name: e.target.value })} />
                </label>
                <label>
                  Id (used in files)
                  <input value={type.id} onChange={(e) => setType({ id: slug(e.target.value) })} />
                </label>
                <label>
                  Colour
                  <input type="color" value={type.color} onChange={(e) => setType({ color: e.target.value })} />
                </label>
              </div>
              <table className="field-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Key</th>
                    <th>Type</th>
                    <th>Choices / links to</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {type.fields.map((f, i) => (
                    <tr key={i}>
                      <td>
                        <input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
                      </td>
                      <td>
                        <input value={f.key} onChange={(e) => setField(i, { key: e.target.value.replace(/[^\w-]/g, "") })} />
                      </td>
                      <td>
                        <select value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })}>
                          {FIELD_TYPES.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {(f.type === "link" || f.type === "links") && (
                          <select value={f.target ?? ""} onChange={(e) => setField(i, { target: e.target.value })} aria-label="Links to">
                            <option value="">Any page</option>
                            {c.cardTypes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} cards
                              </option>
                            ))}
                          </select>
                        )}
                        {f.type === "select" && (
                          <input
                            value={(f.options ?? []).join(", ")}
                            onChange={(e) => setField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                          />
                        )}
                      </td>
                      <td>
                        <button className="quiet" onClick={() => setType({ fields: type.fields.filter((_, j) => j !== i) })} aria-label="Remove field">
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="form-actions left">
                <button onClick={() => setType({ fields: [...type.fields, { key: `field${type.fields.length + 1}`, label: "New field", type: "text" }] })}>+ Field</button>
                <button
                  className="quiet"
                  onClick={() => {
                    setC({ ...c, cardTypes: c.cardTypes.filter((_, i) => i !== typeIdx) });
                    setTypeIdx(0);
                  }}
                >
                  Delete card type
                </button>
              </div>
              <p className="muted small">Existing cards keep their values. Removing a field only hides it from the form; the value stays in the file.</p>
            </div>
          ) : (
            <p className="muted">No card types yet. Add one, or add a kit under “Kit and tools”.</p>
          )}
        </div>
      )}

      {tab === "views" && (
        <div className="form">
          <table className="field-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Card type</th>
                <th>Kind</th>
                <th>Group by / date field</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {c.views.map((v, i) => {
                const vt = c.cardTypes.find((t) => t.id === v.cardType);
                return (
                  <tr key={i}>
                    <td>
                      <input value={v.name} onChange={(e) => setView(i, { name: e.target.value })} />
                    </td>
                    <td>
                      <select value={v.cardType} onChange={(e) => setView(i, { cardType: e.target.value })}>
                        {v.kind === "timeline" && <option value="*">Any card</option>}
                        {c.cardTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select value={v.kind} onChange={(e) => setView(i, { kind: e.target.value as ViewKind })}>
                        <option value="table">Table</option>
                        <option value="board">Board</option>
                        <option value="schedule">Schedule</option>
                        <option value="timeline">Timeline</option>
                        <option value="tree">Family tree</option>
                      </select>
                    </td>
                    <td>
                      {v.kind !== "table" && (
                        <select value={v.field ?? ""} onChange={(e) => setView(i, { field: e.target.value })} aria-label={v.kind === "tree" ? "Parents field" : "Field"}>
                          <option value="">{v.kind === "tree" ? "Parents…" : v.kind === "timeline" ? "When…" : "–"}</option>
                          {(v.cardType === "*" ? c.cardTypes.flatMap((t) => t.fields) : (vt?.fields ?? []))
                            .filter((f, j, all) => all.findIndex((x) => x.key === f.key) === j)
                            .filter((f) =>
                              v.kind === "schedule" ? f.type === "date" : v.kind === "tree" ? f.type === "links" || f.type === "link" : v.kind === "timeline" ? ["number", "date", "text"].includes(f.type) : f.type !== "long",
                            )
                            .map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                        </select>
                      )}
                      {(v.kind === "tree" || v.kind === "timeline") && (
                        <select value={v.field2 ?? ""} onChange={(e) => setView(i, { field2: e.target.value || undefined })} aria-label={v.kind === "tree" ? "Partner field" : "Era field"}>
                          <option value="">{v.kind === "tree" ? "Partner…" : "Era…"}</option>
                          {(v.cardType === "*" ? c.cardTypes.flatMap((t) => t.fields) : (vt?.fields ?? []))
                            .filter((f, j, all) => all.findIndex((x) => x.key === f.key) === j)
                            .filter((f) => (v.kind === "tree" ? f.type === "links" || f.type === "link" : f.type === "text" || f.type === "select"))
                            .map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <button className="quiet" onClick={() => setC({ ...c, views: c.views.filter((_, j) => j !== i) })} aria-label="Remove view">
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="form-actions left">
            <button
              disabled={!c.cardTypes.length}
              onClick={() => setC({ ...c, views: [...c.views, { id: `view-${Date.now()}`, name: "New view", cardType: c.cardTypes[0].id, kind: "table" }] })}
            >
              + View
            </button>
          </div>
        </div>
      )}

      {tab === "general" && (
        <div className="form">
          <p>
            Notebook type: <strong>{c.kitName ?? "none"}</strong>
          </p>
          <button
            onClick={() => {
              onClose();
              onAddKit();
            }}
          >
            Add a kit to this notebook…
          </button>
          <fieldset>
            <legend>Tools</legend>
            {TOOLS.map((t) => (
              <label key={t.id} className="check">
                <input
                  type="checkbox"
                  checked={c.tools.includes(t.id)}
                  onChange={(e) => setC({ ...c, tools: e.target.checked ? [...c.tools, t.id] : c.tools.filter((x) => x !== t.id) })}
                />
                {t.label}
              </label>
            ))}
          </fieldset>
          <label>
            Templates folder
            <input value={c.templatesFolder} onChange={(e) => setC({ ...c, templatesFolder: e.target.value.replace(/^\/+|\/+$/g, "") })} />
          </label>
          <p className="muted small">Settings are stored in the hidden .notesapp folder inside the notebook.</p>
          {isTauri && (
            <p>
              Notes App version {version}{" "}
              <button
                onClick={() => {
                  onClose();
                  checkForUpdates();
                }}
              >
                Check for updates
              </button>
            </p>
          )}
        </div>
      )}

      {tab === "share" && (
        <div className="form">
          <p>Save this notebook's card types, views, tools, section names and templates as a kit file. Your pages are not included.</p>
          <label>
            Kit name
            <input value={kitName} onChange={(e) => setKitName(e.target.value)} />
          </label>
          <label>
            Description
            <input value={kitDesc} onChange={(e) => setKitDesc(e.target.value)} />
          </label>
          <div className="form-actions left">
            <button
              className="primary"
              onClick={async () => {
                try {
                  const { path, kit } = await exportKit(nb.store, c, kitName, kitDesc);
                  rememberKit(kit);
                  nb.changed(path);
                  setMsg(`Saved as “${path}” in the notebook folder. It is also offered when you make a new notebook on this computer.`);
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Save kit file
            </button>
          </div>
          {msg && <p>{msg}</p>}
        </div>
      )}

      <div className="form-actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          onClick={async () => {
            await onSave(c);
            onClose();
          }}
        >
          Save settings
        </button>
      </div>
    </Modal>
  );
}
