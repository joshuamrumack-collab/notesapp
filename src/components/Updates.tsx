import { useEffect, useState } from "react";
import { isTauri } from "../lib/storage";

type Update = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;
type State =
  | { kind: "idle" }
  | { kind: "checking"; manual: boolean }
  | { kind: "none"; manual: boolean }
  | { kind: "available"; update: NonNullable<Update> }
  | { kind: "downloading"; got: number; total: number }
  | { kind: "error"; message: string };

/** Ask for an update check from anywhere (Settings, the start screen). */
export const checkForUpdates = () => window.dispatchEvent(new Event("notesapp:check-updates"));

export function useAppVersion(): string {
  const [v, setV] = useState("");
  useEffect(() => {
    if (!isTauri) return;
    import("@tauri-apps/api/app").then((m) => m.getVersion()).then(setV, () => {});
  }, []);
  return v;
}

/**
 * Looks for a newer version when the app starts and when asked. Updates are downloaded from the
 * project's GitHub releases, checked against the app's built-in signing key, installed and restarted.
 */
export function UpdateBanner({ beforeInstall }: { beforeInstall: () => Promise<void> }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!isTauri) return;
    const run = async (manual: boolean) => {
      setState({ kind: "checking", manual });
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        setState(update ? { kind: "available", update } : { kind: "none", manual });
      } catch (e) {
        // A failed check on start-up (offline, no releases yet) is not worth interrupting anyone for.
        setState(manual ? { kind: "error", message: `Could not check for updates: ${e instanceof Error ? e.message : String(e)}` } : { kind: "idle" });
      }
    };
    const t = window.setTimeout(() => void run(false), 3000);
    const manual = () => void run(true);
    window.addEventListener("notesapp:check-updates", manual);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("notesapp:check-updates", manual);
    };
  }, []);

  if (!isTauri) return null;
  const close = () => setState({ kind: "idle" });

  if (state.kind === "checking" && state.manual) return <div className="update-bar">Checking for updates…</div>;
  if (state.kind === "none" && state.manual)
    return (
      <div className="update-bar">
        You have the newest version.{" "}
        <button className="quiet" onClick={close}>
          OK
        </button>
      </div>
    );
  if (state.kind === "error")
    return (
      <div className="update-bar error-bar">
        {state.message}{" "}
        <button className="quiet" onClick={close}>
          OK
        </button>
      </div>
    );
  if (state.kind === "downloading") {
    const pct = state.total ? Math.round((state.got / state.total) * 100) : 0;
    return (
      <div className="update-bar">
        Downloading the update… {state.total ? `${pct}%` : ""} The app restarts by itself when it is done.
        <progress max={100} value={pct} />
      </div>
    );
  }
  if (state.kind === "available") {
    const u = state.update;
    return (
      <div className="update-bar ready">
        <span>
          <strong>Version {u.version} is available</strong> (you have {u.currentVersion}).
          {u.body ? <span className="muted"> {u.body.split("\n")[0].slice(0, 140)}</span> : null}
        </span>
        <button
          className="primary"
          onClick={async () => {
            try {
              await beforeInstall();
              let got = 0;
              let total = 0;
              setState({ kind: "downloading", got, total });
              await u.downloadAndInstall((ev) => {
                if (ev.event === "Started") total = ev.data.contentLength ?? 0;
                else if (ev.event === "Progress") got += ev.data.chunkLength;
                setState({ kind: "downloading", got, total });
              });
              const { relaunch } = await import("@tauri-apps/plugin-process");
              await relaunch();
            } catch (e) {
              setState({ kind: "error", message: `The update did not install: ${e instanceof Error ? e.message : String(e)}` });
            }
          }}
        >
          Update and restart
        </button>
        <button className="quiet" onClick={close}>
          Later
        </button>
      </div>
    );
  }
  return null;
}
