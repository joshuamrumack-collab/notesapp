import { createContext, useContext } from "react";
import type { NotebookIndex } from "./lib/index";
import type { NotebookConfig } from "./lib/notebook";
import type { Store } from "./lib/storage";

export interface NB {
  store: Store;
  config: NotebookConfig;
  index: NotebookIndex;
  indexVer: number;
  playerSafe: boolean;
  openPath: (path: string) => void;
  /** A file was written outside the open editor (views, tools). Updates search and reloads the page if it is open. */
  changed: (path: string, content?: string) => void;
  notice: (msg: string) => void;
  openTag: (tag: string) => void;
  /** Make a new page and return its path (does not open it). */
  createPage: (dir: string, title: string, ext: string, content: string) => Promise<string>;
}

export const NotebookCtx = createContext<NB | null>(null);
export const useNB = (): NB => {
  const v = useContext(NotebookCtx);
  if (!v) throw new Error("No notebook open");
  return v;
};

export interface PageProps {
  store: Store;
  path: string;
  onState: (s: import("./lib/autosave").SaveState) => void;
  flushRef: React.MutableRefObject<(() => Promise<void>) | null>;
  /** Called after each save with the file content (not called for locked pages). */
  onSaved?: (content: string) => void;
  /** Locked pages must not leave readable backups behind. */
  noBackup?: boolean;
}
