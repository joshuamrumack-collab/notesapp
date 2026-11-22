import { useEffect, useState } from "react";
import { useNB } from "../context";
import { buildShareHtml } from "../lib/share";
import { join } from "../lib/storage";
import { t } from "../lib/i18n";
import { Modal } from "./Modal";

const SHARED = "_shared";

/** Export the pages players may see as one HTML file they can open in any browser (and print as PDF). */
export function ShareSite({ onClose }: { onClose: () => void }) {
  const nb = useNB();
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [title, setTitle] = useState(nb.store.rootName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    nb.store.list("").then((items) => setFolders(items.filter((e) => e.isDir && !/^[._]/.test(e.name)).map((e) => e.name).sort()), () => {});
  }, [nb.store]);
  const make = async () => {
    setBusy(true);
    setError("");
    try {
      const { html, pages, left } = await buildShareHtml(nb.store, nb.index, { title, folder, templatesFolder: nb.config.templatesFolder, cardTypes: nb.config.cardTypes });
      const name = `${title.replace(/[\\/:*?"<>|]/g, "-").trim() || "Shared"}.html`;
      await nb.store.mkdir(SHARED);
      await nb.store.writeText(join(SHARED, name), html);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      a.download = name;
      a.click();
      const where = nb.store.rootPath ? `${nb.store.rootPath}\\${SHARED}\\${name}` : `${SHARED}/${name}`;
      nb.notice(t("Saved {0} pages as {1}. Left out: {2} secret or locked pages.", pages, where, left));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("Share as a website")} onClose={onClose}>
      <p>{t("Makes one file that opens in any browser, with a page list, search, maps with pins and working links. Send it to your players or pupils, or open it and print to PDF.")}</p>
      <p className="muted small">{t("Secret pages, secret boxes and cards, [!secret] callouts and locked pages are left out of the file completely, not just hidden.")}</p>
      <label className="field">
        <span>{t("Title")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>{t("Pages")}</span>
        <select value={folder} onChange={(e) => setFolder(e.target.value)}>
          <option value="">{t("The whole notebook")}</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {t("Only the section {0}", f)}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button onClick={onClose}>{t("Cancel")}</button>
        <button className="primary" disabled={busy} onClick={make}>
          {busy ? t("Working…") : t("Make the website")}
        </button>
      </div>
    </Modal>
  );
}
