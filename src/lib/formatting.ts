// Word-style formatting kept in Markdown. Highlight is Obsidian's ==text==, underline is <u>. Colour, size,
// font, sub/superscript and alignment have no Markdown of their own, so they are written as small HTML tags,
// which Obsidian and most Markdown viewers show too.
import { type Extensions, type JSONContent } from "@tiptap/core";
import { Marked } from "marked";

// Own instance: the editor adds its own syntax to the shared one.
const inline = new Marked({ gfm: true });
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import Highlight from "@tiptap/extension-highlight";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";

type MdNode = JSONContent;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Helpers = { renderChildren: (n: any) => string };

const styleOf = (a: Record<string, unknown> = {}) =>
  [
    a.color && `color: ${a.color}`,
    a.fontSize && `font-size: ${a.fontSize}`,
    a.fontFamily && `font-family: ${String(a.fontFamily).replace(/"/g, "'")}`,
  ]
    .filter(Boolean)
    .join("; ");

const aligned = (node: MdNode, inner: string, tag: string) => {
  const align = node.attrs?.textAlign;
  if (!align || align === "left") return null;
  // Markdown is not read inside HTML tags, so the text inside goes in as HTML too (wiki links stay as they are).
  const html = (inline.parseInline(inner, { async: false }) as string).replace(/\n/g, " ").replace(/==(?!\s)([^=]*[^=\s])==/g, "<mark>$1</mark>");
  return `<${tag} style="text-align: ${align}">${html}</${tag}>`;
};

export const formattingExtensions: Extensions = [
  Highlight.configure({ multicolor: false }),
  TextStyle.extend({
    renderMarkdown(node: MdNode, h: Helpers) {
      const style = styleOf(node.attrs);
      const inner = h.renderChildren(node);
      return style ? `<span style="${style}">${inner}</span>` : inner;
    },
  }),
  Color,
  FontSize,
  FontFamily,
  Subscript.extend({ renderMarkdown: (node: MdNode, h: Helpers) => `<sub>${h.renderChildren(node)}</sub>` }),
  Superscript.extend({ renderMarkdown: (node: MdNode, h: Helpers) => `<sup>${h.renderChildren(node)}</sup>` }),
  TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
];

/** Paragraphs and headings that remember their alignment in Markdown. */
export const AlignedParagraph = Paragraph.extend({
  renderMarkdown(node: MdNode, h: Helpers, ctx: unknown) {
    const plain = Paragraph.config.renderMarkdown as (n: MdNode, h: Helpers, c: unknown) => string;
    const out = plain(node, h, ctx);
    return (out && aligned(node, out, "p")) ?? out;
  },
});
export const AlignedHeading = Heading.extend({
  renderMarkdown(node: MdNode, h: Helpers) {
    const level = Number(node.attrs?.level ?? 1);
    if (!node.content) return "";
    const inner = h.renderChildren(node.content);
    return aligned(node, inner, `h${level}`) ?? `${"#".repeat(level)} ${inner}`;
  },
});
