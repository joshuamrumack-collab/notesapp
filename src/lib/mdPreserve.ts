// Saving a note through the editor rewrites its Markdown in the editor's own style. To keep a vault's files
// as they were, every block the user did not change is written back exactly as it was in the file.
import { Editor } from "@tiptap/core";
import { marked } from "marked";
import { editorExtensions, getMarkdown } from "./md";

interface Block {
  raw: string; // the block exactly as in the file, without trailing blank lines
  start: number;
  end: number;
}

/** Split Markdown into top-level blocks (paragraphs, headings, lists, tables, code, ...). */
export function splitBlocks(md: string): Block[] {
  const out: Block[] = [];
  let pos = 0;
  for (const tok of marked.lexer(md)) {
    const raw = tok.raw;
    const start = md.indexOf(raw, pos);
    const at = start >= 0 ? start : pos;
    pos = at + raw.length;
    if (tok.type === "space" || !raw.trim()) continue;
    const trimmed = raw.replace(/\s+$/, "");
    out.push({ raw: trimmed, start: at, end: at + trimmed.length });
  }
  return out;
}

let helper: Editor | null = null;
const cache = new Map<string, string>();

/** How the editor would write this block if nobody touched it. */
export function normalizeBlock(raw: string): string {
  const hit = cache.get(raw);
  if (hit !== undefined) return hit;
  if (!helper) helper = new Editor({ element: document.createElement("div"), extensions: editorExtensions, content: "" });
  helper.commands.setContent(raw, { contentType: "markdown" } as never);
  const out = getMarkdown(helper).trim();
  if (cache.size > 5000) cache.clear();
  cache.set(raw, out);
  return out;
}

/**
 * Merge: blocks of `edited` that are just the editor's rewrite of an original block are replaced by the
 * original text; changed and new blocks keep the editor's text. If nothing changed, `original` comes back as is.
 */
export function preserveMarkdown(original: string, edited: string, normalize: (raw: string) => string = normalizeBlock): string {
  const orig = splitBlocks(original);
  const next = splitBlocks(edited);
  const norms = orig.map((b) => normalize(b.raw));
  const used: number[] = [];
  let cursor = 0;
  const parts = next.map((b) => {
    // Look ahead from the last match first, so repeated blocks map in order.
    for (const range of [[cursor, orig.length], [0, cursor]] as const) {
      for (let i = range[0]; i < range[1]; i++) {
        if (used.includes(i)) continue;
        if (norms[i] === b.raw || orig[i].raw === b.raw) {
          used.push(i);
          cursor = i + 1;
          return { text: orig[i].raw, from: i };
        }
      }
    }
    return { text: b.raw, from: -1 };
  });
  if (parts.length === orig.length && parts.every((p, i) => p.from === i)) return original;
  let out = "";
  parts.forEach((p, k) => {
    if (k > 0) {
      const prev = parts[k - 1];
      // Neighbours that were neighbours in the file keep the original space between them.
      out += prev.from >= 0 && p.from === prev.from + 1 ? original.slice(orig[prev.from].end, orig[p.from].start) : "\n\n";
    } else if (p.from === 0) {
      out += original.slice(0, orig[0].start);
    }
    out += p.text;
  });
  const trailing = /\s*$/.exec(original)?.[0] ?? "\n";
  return out + (trailing.includes("\n") ? trailing : "\n");
}
