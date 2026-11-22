// Markdown <-> editor helpers. Frontmatter is kept verbatim and never passed through the editor.
import { Editor, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { NotebookImage, WikiLinks } from "./wikilinks";
import { AlignedHeading, AlignedParagraph, formattingExtensions } from "./formatting";
export { splitFrontmatter } from "./frontmatter";

export const editorExtensions: Extensions = [
  StarterKit.configure({ link: { openOnClick: false, autolink: false }, paragraph: false, heading: false }),
  AlignedParagraph,
  AlignedHeading,
  ...formattingExtensions,
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  NotebookImage,
  WikiLinks,
  Markdown,
];

// The serializer escapes some characters that Obsidian syntax relies on; undo that.
export function cleanMarkdown(md: string): string {
  return md
    .replace(/\\\[\\\[/g, "[[")
    .replace(/\\\]\\\]/g, "]]")
    .replace(/!\\\[\\\[/g, "![[")
    .replace(/^((?:> ?)+)\\\[!(\w+)\\\]/gm, "$1[!$2]")
    .replace(/&lt;%/g, "<%")
    .replace(/%&gt;/g, "%>")
    .replace(/&nbsp;/g, " ");
}

export function getMarkdown(editor: Editor): string {
  return cleanMarkdown(editor.getMarkdown());
}

export function roundTrip(md: string): string {
  const el = document.createElement("div");
  const ed = new Editor({ element: el, extensions: editorExtensions, content: md, contentType: "markdown" });
  const out = getMarkdown(ed);
  ed.destroy();
  return out;
}
