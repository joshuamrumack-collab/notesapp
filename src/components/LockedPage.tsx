import { useEffect, useMemo, useState } from "react";
import { type PageProps, useNB } from "../context";
import { lockText, sessionPasswords, unlockText } from "../lib/crypto";
import type { Store } from "../lib/storage";
import { CanvasPage } from "./CanvasPage";
import { MarkdownPage } from "./MarkdownPage";
import { t } from "../lib/i18n";

/** Store wrapper: the locked file is decrypted on read and encrypted on write. Everything else passes through. */
function lockedStore(store: Store, path: string, password: string, kind: "md" | "canvas"): Store {
  return {
    ...store,
    readText: async (p) => (p === path ? (await unlockText(await store.readText(p), password)).text : store.readText(p)),
    writeText: async (p, t) => (p === path ? store.writeText(p, await lockText(t, password, kind)) : store.writeText(p, t)),
  };
}

export function LockedPage(props: PageProps & { onRemoveLock: (password: string) => void }) {
  const nb = useNB();
  const key = (nb.store.rootPath ?? nb.store.rootName) + "::";
  const [password, setPassword] = useState<string | null>(null);
  const [kind, setKind] = useState<"md" | "canvas">("md");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const tryOpen = async (pw: string, remember: boolean) => {
    setBusy(true);
    setError("");
    try {
      const { kind } = await unlockText(await props.store.readText(props.path), pw);
      setKind(kind);
      setPassword(pw);
      if (remember) sessionPasswords.set(key, pw);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Try the password used earlier this session first.
  const remembered = sessionPasswords.get(key);
  useEffect(() => {
    if (remembered) void tryOpen(remembered, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.path]);

  const inner = useMemo(
    () => (password ? lockedStore(props.store, props.path, password, kind) : null),
    [password, props.store, props.path, kind],
  );

  if (!inner || !password) {
    return (
      <div className="page-message">
        <form
          className="form unlock"
          onSubmit={(e) => {
            e.preventDefault();
            void tryOpen(typed, true);
          }}
        >
          <strong>{t("This page is locked.")}</strong>
          <span className="muted">{t("It is encrypted on disk. Type the password to open it.")}</span>
          <input type="password" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t("Password")} />
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={busy || !typed}>
            {busy ? t("Opening…") : t("Unlock")}
          </button>
        </form>
      </div>
    );
  }

  const pageProps = { ...props, store: inner, onSaved: undefined, noBackup: true };
  return (
    <>
      <div className="locked-bar">
        <span>{t("Locked page, open for this session. Images you add are stored unencrypted in _attachments.")}</span>
        <button className="quiet" onClick={() => props.onRemoveLock(password)}>
          {t("Remove lock")}
        </button>
      </div>
      {kind === "canvas" ? <CanvasPage {...pageProps} /> : <MarkdownPage {...pageProps} />}
    </>
  );
}
