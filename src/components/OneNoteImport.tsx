import { useState } from "react";
import { useNB } from "../context";
import { type OnGroup, type OnNotebook, type OnSection, countPages } from "../lib/onenote";
import { type ImportProgress, canImportOneNote, desktopOneNote, importNotebook, loadNotebooks } from "../lib/onenote-import";
import { Modal } from "./Modal";

function sectionIds(items: (OnSection | OnGroup)[]): string[] {
  return items.flatMap((it) => (it.kind === "section" ? (it.locked ? [] : [it.id]) : sectionIds(it.children)));
}

export function OneNoteImport({ onClose, onDone }: { onClose: () => void; onDone: (reportPath: string) => void }) {
  const nb = useNB();
  const [books, setBooks] = useState<OnNotebook[] | null>(null);
  const [book, setBook] = useState<OnNotebook | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  if (!canImportOneNote()) {
    return (
      <Modal title="Import from OneNote" onClose={onClose}>
        <p>OneNote import works in the desktop app on Windows, with the OneNote desktop app (the one in Microsoft Office) installed.</p>
        <p className="muted">It asks OneNote for your notebooks directly, so nothing is uploaded and no sign-in is needed.</p>
      </Modal>
    );
  }

  const tree = (items: (OnSection | OnGroup)[], depth = 0) =>
    items.map((it) =>
      it.kind === "group" ? (
        <div key={it.id}>
          <div className="on-group" style={{ paddingLeft: depth * 16 }}>
            {it.name}
          </div>
          {tree(it.children, depth + 1)}
        </div>
      ) : (
        <label key={it.id} className="check" style={{ paddingLeft: depth * 16 }}>
          <input
            type="checkbox"
            disabled={it.locked}
            checked={chosen.has(it.id)}
            onChange={(e) => {
              const next = new Set(chosen);
              if (e.target.checked) next.add(it.id);
              else next.delete(it.id);
              setChosen(next);
            }}
          />
          {it.name} <span className="muted">({it.locked ? "password protected, unlock it in OneNote first" : `${it.pages.length} pages`})</span>
        </label>
      ),
    );

  return (
    <Modal title="Import from OneNote" onClose={busy ? () => {} : onClose} wide>
      {!books && (
        <div className="form">
          <p>This reads notebooks from the OneNote desktop app on this PC. OneNote may open while it runs. Your OneNote notebooks are not changed.</p>
          <p className="muted small">Kept: sections, section groups, pages and subpages, page order, where each text box sits, text formatting, lists, checkboxes, tables, images, links between pages. Not yet: handwriting, drawings, recordings, attached files, maths.</p>
          {error && <div className="error">{error}</div>}
          <div className="form-actions left">
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setBooks(await loadNotebooks(desktopOneNote));
                } catch (e) {
                  setError(`Could not read from OneNote: ${e instanceof Error ? e.message : String(e)}`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Asking OneNote…" : "Find my OneNote notebooks"}
            </button>
          </div>
        </div>
      )}
      {books && !book && (
        <div className="form">
          {!books.length && <p>OneNote has no open notebooks. Open the notebook in OneNote first.</p>}
          {books.map((b) => (
            <button
              key={b.id}
              className="kit"
              onClick={() => {
                setBook(b);
                setChosen(new Set(sectionIds(b.children)));
              }}
            >
              <strong>{b.name}</strong>
              <span className="muted">{countPages(b.children)} pages</span>
            </button>
          ))}
        </div>
      )}
      {book && !progress && (
        <div className="form">
          <p>
            Choose sections from <strong>{book.name}</strong>. They go into a new folder “{book.name}” in this notebook.
          </p>
          <div className="on-tree">{tree(book.children)}</div>
          {error && <div className="error">{error}</div>}
          <div className="form-actions">
            <button onClick={() => setBook(null)}>Back</button>
            <button
              className="primary"
              disabled={!chosen.size}
              onClick={async () => {
                setBusy(true);
                setProgress({ done: 0, total: 1, current: "" });
                try {
                  const r = await importNotebook(nb.store, desktopOneNote, book, chosen, setProgress);
                  onDone(r.reportPath);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                  setProgress(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Import {chosen.size} {chosen.size === 1 ? "section" : "sections"}
            </button>
          </div>
        </div>
      )}
      {progress && (
        <div className="form">
          <progress max={progress.total || 1} value={progress.done} />
          <p>
            {progress.done} of {progress.total} pages {progress.current && <span className="muted">· {progress.current}</span>}
          </p>
        </div>
      )}
    </Modal>
  );
}
