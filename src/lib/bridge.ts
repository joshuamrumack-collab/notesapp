// Lets editor extensions reach the open notebook (links, images) without passing props through ProseMirror.
import type { Editor } from "@tiptap/core";

export const bridge = {
  currentPath: "",
  /** The text box the user last typed in, so "Link to page" can insert where the cursor is. */
  activeEditor: null as Editor | null,
  open: (_target: string, _from: string) => {},
  pageNames: (): string[] => [],
  imageUrl: async (_src: string, _from: string): Promise<string | null> => null,
};

const urls = new Map<string, string>();
/** Cache of blob URLs by file path, cleared when a notebook closes. */
export const imageCache = {
  get: (k: string) => urls.get(k),
  set: (k: string, v: string) => void urls.set(k, v),
  clear: () => {
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear();
  },
};
