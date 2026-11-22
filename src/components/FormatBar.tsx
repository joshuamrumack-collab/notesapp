import { type ReactNode, useEffect, useReducer, useRef, useState } from "react";

/** Four lines, like the alignment icons in Word. */
const AlignIcon = ({ a }: { a: "left" | "center" | "right" | "justify" }) => {
  const rows = [14, 9, 14, 9];
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      {rows.map((w, i) => {
        const len = a === "justify" ? 14 : w;
        const x = a === "left" || a === "justify" ? 1 : a === "right" ? 15 - len : (16 - len) / 2;
        return <rect key={i} x={x} y={1 + i * 3.4} width={len} height="1.6" rx="0.8" fill="currentColor" />;
      })}
    </svg>
  );
};
import type { Editor } from "@tiptap/core";
import { bridge } from "../lib/bridge";
import { t } from "../lib/i18n";

const FONTS: [string, string][] = [
  ["", "Default font"],
  ["Arial, sans-serif", "Arial"],
  ["Georgia, serif", "Georgia"],
  ["'Times New Roman', serif", "Times New Roman"],
  ["Verdana, sans-serif", "Verdana"],
  ["'Comic Sans MS', cursive", "Comic Sans"],
  ["'Courier New', monospace", "Courier New"],
  ["OpenDyslexic, 'Comic Sans MS', sans-serif", "OpenDyslexic"],
];
const SIZES = ["", "12px", "14px", "16px", "18px", "20px", "24px", "32px", "40px"];
const COLORS = ["#1f2328", "#6b7078", "#c53030", "#dd6b20", "#b7791f", "#2f855a", "#2b6cb0", "#6b46c1", "#b83280", "#ffffff"];

/** The editor the user last typed in, kept up to date (re-renders on every change in it). */
function useActiveEditor(): Editor | null {
  const [ed, setEd] = useState<Editor | null>(bridge.activeEditor);
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const changed = () => setEd(bridge.activeEditor && !bridge.activeEditor.isDestroyed ? bridge.activeEditor : null);
    window.addEventListener("notesapp:editor", changed);
    return () => window.removeEventListener("notesapp:editor", changed);
  }, []);
  useEffect(() => {
    if (!ed) return;
    ed.on("transaction", tick);
    ed.on("selectionUpdate", tick);
    return () => {
      ed.off("transaction", tick);
      ed.off("selectionUpdate", tick);
    };
  }, [ed]);
  return ed && !ed.isDestroyed ? ed : null;
}

/** Word / Google Docs style formatting for the text you are writing in. */
export function FormatBar() {
  const ed = useActiveEditor();
  const [palette, setPalette] = useState(false);
  const paletteRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!palette) return;
    const close = (e: MouseEvent) => !paletteRef.current?.contains(e.target as Node) && setPalette(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [palette]);
  const off = !ed;
  const run = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => ed && fn(ed.chain().focus()).run();
  const on = (name: string, attrs?: Record<string, unknown>) => !!ed?.isActive(name, attrs);
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the cursor in the text
  const Btn = ({ label, title, active, onClick, className }: { label: ReactNode; title: string; active?: boolean; onClick: () => void; className?: string }) => (
    <button type="button" className={"fmt-btn" + (active ? " on" : "") + (className ? " " + className : "")} title={title} aria-label={title} aria-pressed={active} disabled={off} onMouseDown={keep} onClick={onClick}>
      {label}
    </button>
  );
  const block = !ed
    ? "p"
    : on("heading", { level: 1 })
      ? "h1"
      : on("heading", { level: 2 })
        ? "h2"
        : on("heading", { level: 3 })
          ? "h3"
          : on("blockquote")
            ? "quote"
            : on("codeBlock")
              ? "code"
              : "p";
  const style = (ed?.getAttributes("textStyle") ?? {}) as { color?: string; fontSize?: string; fontFamily?: string };
  const inList = on("bulletList") || on("orderedList") || on("taskList");
  const listItem = on("taskItem") ? "taskItem" : "listItem";
  return (
    <div className={"format-bar" + (off ? " idle" : "")} role="toolbar" aria-label={t("Text formatting")}>
      <select
        value={block}
        disabled={off}
        aria-label={t("Paragraph style")}
        onChange={(e) => {
          const v = e.target.value;
          run((c) =>
            v === "p" ? c.setParagraph() : v === "quote" ? c.setParagraph().toggleBlockquote() : v === "code" ? c.toggleCodeBlock() : c.setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }),
          );
        }}
      >
        <option value="p">{t("Normal text")}</option>
        <option value="h1">{t("Heading 1")}</option>
        <option value="h2">{t("Heading 2")}</option>
        <option value="h3">{t("Heading 3")}</option>
        <option value="quote">{t("Quote")}</option>
        <option value="code">{t("Code")}</option>
      </select>
      <select value={style.fontFamily ?? ""} disabled={off} aria-label={t("Font")} className="fmt-font" onChange={(e) => run((c) => (e.target.value ? c.setFontFamily(e.target.value) : c.unsetFontFamily()))}>
        {FONTS.map(([v, label]) => (
          <option key={label} value={v} style={v ? { fontFamily: v } : undefined}>
            {v ? label : t(label)}
          </option>
        ))}
      </select>
      <select value={style.fontSize ?? ""} disabled={off} aria-label={t("Text size")} className="fmt-size" onChange={(e) => run((c) => (e.target.value ? c.setFontSize(e.target.value) : c.unsetFontSize()))}>
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {s ? s.replace("px", "") : t("Size")}
          </option>
        ))}
      </select>
      <span className="fmt-sep" />
      <Btn label="B" className="b" title={t("Bold (Ctrl+B)")} active={on("bold")} onClick={() => run((c) => c.toggleBold())} />
      <Btn label="I" className="i" title={t("Italic (Ctrl+I)")} active={on("italic")} onClick={() => run((c) => c.toggleItalic())} />
      <Btn label="U" className="u" title={t("Underline (Ctrl+U)")} active={on("underline")} onClick={() => run((c) => c.toggleUnderline())} />
      <Btn label="S" className="s" title={t("Strikethrough")} active={on("strike")} onClick={() => run((c) => c.toggleStrike())} />
      <Btn label="x₂" title={t("Subscript")} active={on("subscript")} onClick={() => run((c) => c.toggleSubscript())} />
      <Btn label="x²" title={t("Superscript")} active={on("superscript")} onClick={() => run((c) => c.toggleSuperscript())} />
      <span className="fmt-pop" ref={paletteRef}>
        <button type="button" className="fmt-btn fmt-color" title={t("Text colour")} aria-label={t("Text colour")} disabled={off} onMouseDown={keep} onClick={() => setPalette(!palette)}>
          A<i style={{ background: style.color ?? "currentColor" }} />
        </button>
        {palette && (
          <span className="fmt-palette">
            {COLORS.map((c) => (
              <button key={c} type="button" style={{ background: c }} title={c} aria-label={c} onMouseDown={keep} onClick={() => (run((x) => x.setColor(c)), setPalette(false))} />
            ))}
            <button type="button" className="fmt-nocolor" onMouseDown={keep} onClick={() => (run((x) => x.unsetColor()), setPalette(false))}>
              {t("Automatic")}
            </button>
          </span>
        )}
      </span>
      <Btn label="🖍" title={t("Highlight")} active={on("highlight")} onClick={() => run((c) => c.toggleHighlight())} />
      <span className="fmt-sep" />
      <Btn label={<AlignIcon a="left" />} title={t("Align left")} active={!!ed && !["center", "right", "justify"].some((a) => ed.isActive({ textAlign: a }))} onClick={() => run((c) => c.unsetTextAlign())} />
      <Btn label={<AlignIcon a="center" />} title={t("Centre")} active={!!ed?.isActive({ textAlign: "center" })} onClick={() => run((c) => c.setTextAlign("center"))} />
      <Btn label={<AlignIcon a="right" />} title={t("Align right")} active={!!ed?.isActive({ textAlign: "right" })} onClick={() => run((c) => c.setTextAlign("right"))} />
      <Btn label={<AlignIcon a="justify" />} title={t("Justify")} active={!!ed?.isActive({ textAlign: "justify" })} onClick={() => run((c) => c.setTextAlign("justify"))} />
      <span className="fmt-sep" />
      <Btn label="•" title={t("Bulleted list")} active={on("bulletList")} onClick={() => run((c) => c.toggleBulletList())} />
      <Btn label="1." title={t("Numbered list")} active={on("orderedList")} onClick={() => run((c) => c.toggleOrderedList())} />
      <Btn label="☑" title={t("Checklist")} active={on("taskList")} onClick={() => run((c) => c.toggleTaskList())} />
      <Btn label="⇤" title={t("Decrease indent (Shift+Tab)")} onClick={() => inList && run((c) => c.liftListItem(listItem))} />
      <Btn label="⇥" title={t("Increase indent (Tab)")} onClick={() => inList && run((c) => c.sinkListItem(listItem))} />
      <span className="fmt-sep" />
      <Btn label="⊞" title={t("Insert table")} onClick={() => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))} />
      {on("table") && (
        <>
          <Btn label="+⇣" title={t("Add row")} onClick={() => run((c) => c.addRowAfter())} />
          <Btn label="+⇢" title={t("Add column")} onClick={() => run((c) => c.addColumnAfter())} />
          <Btn label="−⇣" title={t("Delete row")} onClick={() => run((c) => c.deleteRow())} />
          <Btn label="−⇢" title={t("Delete column")} onClick={() => run((c) => c.deleteColumn())} />
        </>
      )}
      <Btn label="―" title={t("Horizontal line")} onClick={() => run((c) => c.setHorizontalRule())} />
      <Btn label="⌫" title={t("Clear formatting")} onClick={() => run((c) => c.unsetAllMarks().unsetTextAlign().clearNodes())} />
      {off && <span className="muted small fmt-hint">{t("Click in some text to format it.")}</span>}
    </div>
  );
}
