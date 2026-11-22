import { useEffect, useState } from "react";
import { useNB } from "../context";
import { type Version, listVersions } from "../lib/history";
import { parseCanvas } from "../lib/canvas";
import { ext, join } from "../lib/storage";
import { getLang, t } from "../lib/i18n";
import { Modal } from "./Modal";

/** Readable text of a saved version, for the preview. */
function previewText(path: string, src: string): string {
  if (ext(path) === "canvas") {
    try {
      return parseCanvas(src)
        .nodes.map((n) => (typeof n.text === "string" ? n.text : n.type === "file" ? `[${n.file}]` : ""))
        .filter(Boolean)
        .join("\n\n――――\n\n");
    } catch {
      return src;
    }
  }
  if (ext(path) === "map") return t("A map: pins and picture.");
  return src;
}

export function HistoryModal({ path, onClose, beforeRestore }: { path: string; onClose: () => void; beforeRestore: () => Promise<void> }) {
  const nb = useNB();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [sel, setSel] = useState<Version | null>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    listVersions(nb.store, path).then((v) => {
      setVersions(v);
      setSel(v[1] ?? v[0] ?? null);
    });
  }, [nb.store, path]);
  useEffect(() => {
    if (sel) nb.store.readText(sel.file).then(setText, () => setText(""));
  }, [sel, nb.store]);
  const fmt = (n: number) => new Date(n).toLocaleString(getLang() === "sv" ? "sv-SE" : undefined, { dateStyle: "medium", timeStyle: "short" });
  const restore = async () => {
    if (!sel) return;
    await beforeRestore();
    const content = await nb.store.readText(sel.file);
    // Keep what is there now as a version of its own, so the restore can be undone.
    const now = await nb.store.readText(path).catch(() => "");
    if (now && now !== content) await nb.store.writeText(join(sel.file.slice(0, sel.file.lastIndexOf("/")), `${Date.now()}.${ext(path)}`), now);
    await nb.store.writeText(path, content);
    nb.changed(path, content);
    nb.notice(t("Restored the version from {0}. What was there before is kept in the history.", fmt(sel.time)));
    onClose();
  };
  return (
    <Modal title={t("Page history")} onClose={onClose} wide>
      {versions === null && <p className="muted">{t("Loading…")}</p>}
      {versions?.length === 0 && <p>{t("No earlier versions yet. A version is kept every few minutes while you edit.")}</p>}
      {versions && versions.length > 0 && (
        <div className="history">
          <ul className="history-list">
            {versions.map((v, i) => (
              <li key={v.file}>
                <button className={sel?.file === v.file ? "selected" : ""} onClick={() => setSel(v)}>
                  {fmt(v.time)}
                  {i === 0 && <span className="muted small"> · {t("newest")}</span>}
                </button>
              </li>
            ))}
          </ul>
          <pre className="history-preview">{previewText(path, text)}</pre>
        </div>
      )}
      <p className="muted small">{t("Kept in the hidden .notesapp/history folder of the notebook, up to 50 versions per page. Locked pages have no history.")}</p>
      <div className="actions">
        <button onClick={onClose}>{t("Close")}</button>
        <button className="primary" disabled={!sel} onClick={restore}>
          {t("Restore this version")}
        </button>
      </div>
    </Modal>
  );
}
