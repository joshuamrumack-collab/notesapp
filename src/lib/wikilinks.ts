// [[links]]: highlighted, clickable, autocompleted. ![[image.png]] embeds shown below the text.
// Also marks "> [!secret]" callouts so player-safe mode can hide them.
import { Extension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { bridge } from "./bridge";
import { isImage } from "./canvas";
import { LINK_RE, TAG_RE, linkTarget } from "./links";

function imageWidget(src: string): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "embed";
  wrap.contentEditable = "false";
  const img = document.createElement("img");
  img.alt = src;
  wrap.appendChild(img);
  bridge.imageUrl(src, bridge.currentPath).then((url) => {
    if (url) img.src = url;
    else wrap.textContent = `Image not found: ${src}`;
  });
  return wrap;
}

function decorate(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  const seen = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false;
    if (node.type.name === "blockquote" && /^\s*\[!secret\]/i.test(node.textContent)) {
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "secret-block" }));
    }
    if (!node.isText || !node.text || node.marks.some((m) => m.type.name === "code")) return;
    for (const m of node.text.matchAll(LINK_RE)) {
      const from = pos + m.index;
      const to = from + m[0].length;
      const raw = m[2];
      if (m[1]) {
        const src = raw.split("|")[0].trim();
        decos.push(Decoration.inline(from, to, { class: "wikiembed-src" }));
        if (isImage(src)) {
          const n = (seen.get(src) ?? 0) + 1;
          seen.set(src, n);
          decos.push(Decoration.widget(to, () => imageWidget(src), { key: `${src}#${n}`, side: 1 }));
        }
      } else {
        decos.push(Decoration.inline(from, from + 2, { class: "wikilink-bracket" }));
        const target = linkTarget(raw);
        const exists = bridge.exists(target, bridge.currentPath);
        decos.push(
          Decoration.inline(from + 2, to - 2, {
            class: "wikilink" + (exists ? "" : " missing"),
            "data-target": target,
            title: exists ? "" : "Not written yet. Click to create it.",
          }),
        );
        decos.push(Decoration.inline(to - 2, to, { class: "wikilink-bracket" }));
      }
    }
  });
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false;
    if (!node.isText || !node.text || node.marks.some((m) => m.type.name === "code")) return;
    for (const m of node.text.matchAll(TAG_RE)) {
      if (/^\d+$/.test(m[2])) continue;
      const from = pos + m.index + m[1].length;
      decos.push(Decoration.inline(from, from + 1 + m[2].length, { class: "hashtag", "data-tag": m[2], title: "Show pages with this tag" }));
    }
  });
  return DecorationSet.create(doc, decos);
}

const linkKey = new PluginKey<DecorationSet>("wikilinks");

function suggestionPopup() {
  let el: HTMLDivElement | null = null;
  let items: string[] = [];
  let active = 0;
  let props: SuggestionProps<string> | null = null;
  const draw = () => {
    if (!el || !props) return;
    el.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "suggest-empty";
      empty.textContent = props.query ? `New page: ${props.query}` : "Type a page name";
      el.appendChild(empty);
    }
    items.forEach((name, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "suggest-item" + (i === active ? " active" : "");
      b.textContent = name;
      b.onmousedown = (e) => {
        e.preventDefault();
        props?.command(name);
      };
      el!.appendChild(b);
    });
    const r = props.clientRect?.();
    if (r) {
      el.style.left = `${r.left}px`;
      el.style.top = `${r.bottom + 4}px`;
    }
  };
  return {
    onStart: (p: SuggestionProps<string>) => {
      props = p;
      items = p.items;
      active = 0;
      el = document.createElement("div");
      el.className = "suggest-popup";
      document.body.appendChild(el);
      draw();
    },
    onUpdate: (p: SuggestionProps<string>) => {
      props = p;
      items = p.items;
      active = Math.min(active, Math.max(0, items.length - 1));
      draw();
    },
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (!props) return false;
      if (event.key === "ArrowDown") {
        active = (active + 1) % Math.max(1, items.length);
        draw();
        return true;
      }
      if (event.key === "ArrowUp") {
        active = (active - 1 + items.length) % Math.max(1, items.length);
        draw();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const pick = items[active] ?? props.query.trim();
        if (pick) props.command(pick);
        return true;
      }
      if (event.key === "Escape") {
        el?.remove();
        el = null;
        return true;
      }
      return false;
    },
    onExit: () => {
      el?.remove();
      el = null;
      props = null;
    },
  };
}

export const WikiLinks = Extension.create({
  name: "wikiLinks",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<DecorationSet>({
        key: linkKey,
        state: {
          init: (_, { doc }) => decorate(doc),
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old),
        },
        props: {
          decorations: (state) => linkKey.getState(state),
          handleClick: (_view, _pos, event) => {
            const tag = (event.target as HTMLElement | null)?.closest?.("[data-tag]") as HTMLElement | null;
            if (tag) {
              bridge.openTag(tag.dataset.tag ?? "");
              return true;
            }
            const t = (event.target as HTMLElement | null)?.closest?.("[data-target]") as HTMLElement | null;
            if (!t) return false;
            bridge.open(t.dataset.target ?? "", bridge.currentPath);
            return true;
          },
        },
      }),
      Suggestion<string, string>({
        editor,
        pluginKey: new PluginKey("wikiSuggest"),
        char: "[[",
        allowSpaces: true,
        allowedPrefixes: null,
        items: ({ query }) => {
          const q = query.toLowerCase();
          const names = [...new Set(bridge.pageNames())];
          return names
            .filter((n) => n.toLowerCase().includes(q))
            .sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)) || a.length - b.length)
            .slice(0, 8);
        },
        command: ({ editor, range, props }) => {
          // Remove a "]]" the user may already have typed after the cursor.
          const after = editor.state.doc.textBetween(range.to, Math.min(range.to + 2, editor.state.doc.content.size), "");
          const to = after === "]]" ? range.to + 2 : range.to;
          editor.chain().focus().insertContentAt({ from: range.from, to }, `[[${props}]]`).run();
        },
        render: suggestionPopup,
      }),
    ];
  },
});

/** Markdown images, shown from the notebook's own files. */
export const NotebookImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement("img");
      const src = String(node.attrs.src ?? "");
      img.alt = String(node.attrs.alt ?? "");
      img.className = "md-image";
      if (/^(https?:|data:|blob:)/i.test(src)) img.src = src;
      else bridge.imageUrl(src, bridge.currentPath).then((u) => u && (img.src = u));
      return { dom: img };
    };
  },
}).configure({ inline: true });
