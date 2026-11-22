import { useLayoutEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { bridge } from "../lib/bridge";
import { editorExtensions, getMarkdown } from "../lib/md";
import { getLang } from "../lib/i18n";

interface Props {
  initial: string;
  autoFocus?: boolean;
  onChange: (markdown: string) => void;
  onBlur?: (isEmpty: boolean) => void;
  onFocus?: () => void;
  editorRef?: React.MutableRefObject<Editor | null>;
}

/** Formatted text editor that reads and writes Markdown. `initial` is only used when it is first shown. */
export function RichText({ initial, autoFocus, onChange, onBlur, onFocus, editorRef }: Props) {
  const [start] = useState(initial);
  const cb = useRef({ onChange, onBlur, onFocus });
  cb.current = { onChange, onBlur, onFocus };
  const editor = useEditor({
    extensions: editorExtensions,
    content: start,
    contentType: "markdown",
    // Spell checking in the interface language (Windows uses its own dictionaries for this).
    editorProps: { attributes: { spellcheck: "true", lang: getLang() === "sv" ? "sv-SE" : "en" } },
    onUpdate: ({ editor }) => cb.current.onChange(getMarkdown(editor)),
    onBlur: ({ editor }) => cb.current.onBlur?.(editor.isEmpty),
    onFocus: ({ editor }) => {
      if (bridge.activeEditor !== editor) {
        bridge.activeEditor = editor;
        window.dispatchEvent(new Event("notesapp:editor"));
      }
      cb.current.onFocus?.();
    },
    onDestroy: () => {
      if (bridge.activeEditor?.isDestroyed) {
        bridge.activeEditor = null;
        window.dispatchEvent(new Event("notesapp:editor"));
      }
    },
  });
  if (editorRef) editorRef.current = editor;
  useLayoutEffect(() => {
    // Focus as soon as the editor is on the page, so typing lands in a box that was just created.
    if (autoFocus && editor) editor.commands.focus("end");
  }, [autoFocus, editor]);
  return <EditorContent editor={editor} className="richtext" />;
}
