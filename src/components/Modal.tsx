import { type ReactNode, useEffect, useState } from "react";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " modal-wide" : "")} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="quiet" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export interface PromptField {
  key: string;
  label: string;
  type?: "text" | "password";
  value?: string;
}

/** A small form. onSubmit may throw to show an error and keep the form open. */
export function PromptModal(props: {
  title: string;
  fields: PromptField[];
  submit: string;
  note?: ReactNode;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(props.fields.map((f) => [f.key, f.value ?? ""])));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={props.title} onClose={props.onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await props.onSubmit(values);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {props.note && <div className="muted">{props.note}</div>}
        {props.fields.map((f, i) => (
          <label key={f.key}>
            {f.label}
            <input
              type={f.type ?? "text"}
              autoFocus={i === 0}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </label>
        ))}
        {error && <div className="error">{error}</div>}
        <div className="form-actions">
          <button type="button" onClick={props.onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Working…" : props.submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
