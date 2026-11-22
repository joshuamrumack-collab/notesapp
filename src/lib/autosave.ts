import { useCallback, useEffect, useRef } from "react";

export type SaveState = "saved" | "dirty" | "saving" | "error";

/**
 * Debounced saving. Call markDirty() after a change; save() runs shortly after.
 * flush() saves right away if needed, and is also called when the page closes.
 */
export function useAutosave(save: () => Promise<void>, onState: (s: SaveState) => void, delay = 600) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const stateRef = useRef(onState);
  stateRef.current = onState;
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const running = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    await running.current;
    if (!dirty.current) return;
    dirty.current = false;
    stateRef.current("saving");
    running.current = saveRef.current().then(
      () => stateRef.current(dirty.current ? "dirty" : "saved"),
      (e) => {
        console.error("Save failed", e);
        dirty.current = true;
        stateRef.current("error");
      },
    );
    await running.current;
  }, []);

  const markDirty = useCallback(() => {
    dirty.current = true;
    stateRef.current("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
  }, [flush, delay]);

  useEffect(() => () => void flush(), [flush]);
  return { markDirty, flush };
}
