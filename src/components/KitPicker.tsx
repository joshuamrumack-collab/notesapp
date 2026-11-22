import { useState } from "react";
import { type Kit, builtInKits as englishKits, isKit } from "../lib/kits";
import { translateKit } from "../lib/i18n-kits";
import { getLang } from "../lib/i18n";
// Built-in kits in the interface language (ids and field keys are the same in every language).
const builtIn = () => (getLang() === "sv" ? englishKits.map(translateKit) : englishKits);
import { rememberKit, savedKits } from "../lib/notebook";
import { Modal } from "./Modal";
import { t } from "../lib/i18n";

/** Choose a notebook type. Used when making a new notebook and from Notebook settings. */
export function KitPicker(props: {
  title: string;
  emptyFolder: boolean;
  onPick: (kit: Kit, opts: { sections: boolean; startPage: boolean }) => Promise<void>;
  onClose: () => void;
  allowNone?: boolean;
}) {
  const [kits, setKits] = useState<Kit[]>([...builtIn(), ...savedKits()]);
  const [chosen, setChosen] = useState<Kit>(kits[0]);
  const [sections, setSections] = useState(props.emptyFolder);
  const [startPage, setStartPage] = useState(props.emptyFolder);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={props.title} onClose={props.onClose} wide>
      <div className="kit-grid">
        {kits.map((k) => (
          <button key={k.id} className={"kit" + (chosen.id === k.id ? " chosen" : "")} onClick={() => setChosen(k)}>
            <strong>{k.name}</strong>
            <span>{k.description}</span>
            <span className="muted small">
              {k.cardTypes.map((c) => c.name).join(", ") || t("No cards")}
              {k.tools.length ? " · " + k.tools.join(", ") : ""}
            </span>
          </button>
        ))}
        <label className="kit kit-load">
          <strong>{t("Load a kit file…")}</strong>
          <span>{t("A .kit.json file saved from another notebook.")}</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const kit = JSON.parse(await file.text());
                if (!isKit(kit)) throw new Error("That file is not a notebook kit.");
                rememberKit(kit);
                setKits([...builtIn(), ...savedKits()]);
                setChosen(kit);
                setError("");
              } catch (err) {
                setError(err instanceof Error ? err.message : t("Could not read that file."));
              }
            }}
          />
        </label>
      </div>
      <div className="form">
        <label className="check">
          <input type="checkbox" checked={sections} onChange={(e) => setSections(e.target.checked)} />
          {t("Create the starter sections ({0}). Existing folders are left as they are.", chosen.sections.join(", ") || t("none"))}
        </label>
        <label className="check">
          <input type="checkbox" checked={startPage} onChange={(e) => setStartPage(e.target.checked)} />
          {t("Add a “Start here” page")}
        </label>
        {error && <div className="error">{error}</div>}
        <div className="form-actions">
          <button onClick={props.onClose}>{props.allowNone ? t("Skip") : t("Cancel")}</button>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await props.onPick(chosen, { sections, startPage });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            }}
          >
            {t("Use {0}", chosen.name)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
