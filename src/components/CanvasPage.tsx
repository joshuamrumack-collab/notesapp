import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useNB, type PageProps } from "../context";
import { type SaveState, useAutosave } from "../lib/autosave";
import {
  type CanvasDoc,
  type CanvasEdge,
  type CanvasNode,
  type Rect,
  type Side,
  edgePath,
  facingSides,
  intersects,
  isImage,
  nearestSide,
  newId,
  parseCanvas,
  serializeCanvas,
  sidePoint,
} from "../lib/canvas";
import { newCardText } from "../lib/cards";
import { frontData, setFrontField, splitFrontmatter } from "../lib/frontmatter";
import type { CardType } from "../lib/kits";
import { type Store, basename } from "../lib/storage";
import { type ImageSource, collectImages, mightHaveImages, saveImages } from "../lib/dropImages";
import { bridge, imageCache } from "../lib/bridge";
import { propertyTags } from "../lib/links";
import { t } from "../lib/i18n";
import { CardFields } from "./CardFields";
import { LinkButton, insertLink } from "./PagePicker";
import { RichText } from "./RichText";
import { FormatBar } from "./FormatBar";
import { TagBar } from "./TagBar";

export { ATTACHMENTS } from "../lib/dropImages";

const SIDES: Side[] = ["top", "right", "bottom", "left"];
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];
const HISTORY = 100;

/** Is the keyboard focus in something that takes text (so canvas shortcuts must not fire)? */
const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

export function CanvasPage({ store, path, onState, flushRef, onSaved }: PageProps) {
  const nb = useNB();
  const [doc, setDoc] = useState<CanvasDoc | null>(null);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [band, setBand] = useState<Rect | null>(null);
  const [linking, setLinking] = useState<{ from: string; side: Side; x: number; y: number } | null>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  // Text boxes remount (and so show restored text) when their revision changes after undo or redo.
  const [revs, setRevs] = useState<Record<string, number>>({});
  const [undoStack, setUndo] = useState<CanvasDoc[]>([]);
  const [redoStack, setRedo] = useState<CanvasDoc[]>([]);
  const [dropping, setDropping] = useState(false);
  const docRef = useRef<CanvasDoc | null>(null);
  docRef.current = doc;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const boxEls = useRef(new Map<string, HTMLElement>());
  const fileInput = useRef<HTMLInputElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const { markDirty, flush } = useAutosave(
    async () => {
      const d = docRef.current;
      if (!d) return;
      const nodes = d.nodes.map((n) => {
        const el = boxEls.current.get(n.id);
        return el && n.type === "text" ? { ...n, height: el.offsetHeight } : n;
      });
      const text = serializeCanvas({ ...d, nodes });
      await store.writeText(path, text);
      onSaved?.(text);
    },
    onState as (s: SaveState) => void,
  );
  flushRef.current = flush;

  useEffect(() => {
    let alive = true;
    store.readText(path).then(
      (src) => {
        if (!alive) return;
        try {
          setDoc(parseCanvas(src));
        } catch {
          setError(t("This file is not a valid canvas file, so it was left untouched."));
        }
      },
      (e) => alive && setError(String(e)),
    );
    return () => {
      alive = false;
    };
  }, [store, path]);

  // ---------- changes and undo ----------
  /** Remember the page as it is now, so the next change can be undone. */
  const snapshot = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    setUndo((u) => [...u.slice(-HISTORY + 1), d]);
    setRedo([]);
  }, []);

  /** A change to boxes or arrows. With record=false it joins the previous undo step (dragging, typing). */
  const update = (fn: (d: CanvasDoc) => CanvasDoc, record = true) => {
    if (record) snapshot();
    setDoc((d) => (d ? fn(d) : d));
    markDirty();
  };
  const change = (fn: (nodes: CanvasNode[]) => CanvasNode[], record = true) => update((d) => ({ ...d, nodes: fn(d.nodes) }), record);
  const patch = (id: string, p: Partial<CanvasNode>, record = true) => change((ns) => ns.map((n) => (n.id === id ? { ...n, ...p } : n)), record);
  const removeNodes = (ids: Set<string>) => {
    if (!ids.size) return;
    update((d) => ({ ...d, nodes: d.nodes.filter((n) => !ids.has(n.id)), edges: d.edges.filter((e) => !ids.has(e.fromNode) && !ids.has(e.toNode)) }));
    setSelected(new Set());
  };
  const bottomOf = () => Math.max(0, ...(docRef.current?.nodes ?? []).map((n) => n.y + (heights[n.id] ?? n.height)));

  const restore = (target: CanvasDoc, from: CanvasDoc) => {
    // Remount text boxes whose text the restore changes.
    const before = new Map(from.nodes.map((n) => [n.id, n.text]));
    setRevs((r) => {
      const next = { ...r };
      for (const n of target.nodes) if (before.get(n.id) !== n.text) next[n.id] = (next[n.id] ?? 0) + 1;
      return next;
    });
    setDoc(target);
    setSelected(new Set());
    setSelEdge(null);
    markDirty();
  };
  const undo = () => {
    const d = docRef.current;
    if (!d || !undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndo(undoStack.slice(0, -1));
    setRedo((r) => [...r, d]);
    restore(prev, d);
  };
  const redo = () => {
    const d = docRef.current;
    if (!d || !redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedo(redoStack.slice(0, -1));
    setUndo((u) => [...u, d]);
    restore(next, d);
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing() || !docRef.current) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && k === "a") {
        e.preventDefault();
        setSelected(new Set(docRef.current.nodes.map((n) => n.id)));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selEdge) {
          e.preventDefault();
          update((d) => ({ ...d, edges: d.edges.filter((x) => x.id !== selEdge) }));
          setSelEdge(null);
        } else if (selected.size) {
          e.preventDefault();
          removeNodes(selected);
        }
      } else if (e.key === "Escape") {
        setSelected(new Set());
        setSelEdge(null);
      } else if (e.key.startsWith("Arrow") && selected.size) {
        e.preventDefault();
        const step = e.shiftKey ? 40 : 10;
        const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
        change((ns) => ns.map((n) => (selected.has(n.id) ? { ...n, x: Math.max(0, n.x + dx), y: Math.max(0, n.y + dy) } : n)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- zoom: buttons, Ctrl + mouse wheel ----------
  const zoomTo = (z: number, anchor?: { x: number; y: number }) => {
    const el = scroller.current;
    const old = zoomRef.current;
    const nz = Math.min(2, Math.max(0.25, z));
    setZoom(nz);
    if (el) {
      const ax = anchor?.x ?? el.clientWidth / 2;
      const ay = anchor?.y ?? el.clientHeight / 2;
      const cx = (el.scrollLeft + ax) / old;
      const cy = (el.scrollTop + ay) / old;
      requestAnimationFrame(() => {
        el.scrollLeft = cx * nz - ax;
        el.scrollTop = cy * nz - ay;
      });
    }
  };
  const stepZoom = (dir: 1 | -1) => {
    const z = zoomRef.current;
    const next = dir > 0 ? ZOOMS.find((x) => x > z + 0.001) : [...ZOOMS].reverse().find((x) => x < z - 0.001);
    zoomTo(next ?? z);
  };
  const fitAll = () => {
    const el = scroller.current;
    const d = docRef.current;
    if (!el || !d || !d.nodes.length) return zoomTo(1);
    const right = Math.max(...d.nodes.map((n) => n.x + n.width)) + 40;
    const bottom = Math.max(...d.nodes.map((n) => n.y + (heights[n.id] ?? n.height))) + 40;
    const z = Math.min(1, el.clientWidth / right, el.clientHeight / bottom);
    setZoom(Math.max(0.25, z));
    requestAnimationFrame(() => {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    });
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });

  // Box heights for arrows: text boxes grow with their text.
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      const next: Record<string, number> = {};
      for (const [id, el] of boxEls.current) next[id] = el.offsetHeight;
      setHeights((h) => (Object.keys(next).length === Object.keys(h).length && Object.entries(next).every(([k, v]) => h[k] === v) ? h : next));
    });
    for (const el of boxEls.current.values()) ro.observe(el);
    return () => ro.disconnect();
  });

  /** Pointer position on the page, in page units (zoom removed). */
  const toPage = (clientX: number, clientY: number) => {
    const r = surface.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / zoomRef.current, y: (clientY - r.top) / zoomRef.current };
  };
  const rectOf = (n: CanvasNode): Rect => ({ x: n.x, y: n.y, width: n.width, height: heights[n.id] ?? n.height });

  const linkTo = (target: string) => {
    const inner = nb.index.linkTo(target);
    const ed = bridge.activeEditor;
    // Insert where the cursor is, if it is in a box on this page; otherwise add a new box with the link.
    if (ed && !ed.isDestroyed && surface.current?.contains(ed.view.dom) && insertLink(ed, inner)) return;
    const id = newId();
    change((ns) => [...ns, { id, type: "text", text: `[[${inner}]]`, x: 40, y: bottomOf() + 30, width: 320, height: 40 }]);
  };

  /** Save dropped or pasted images and put each one on the page as an image box. */
  const addImages = async (src: ImageSource, x: number, y: number) => {
    if (!src.files.length && !src.urls.length) return;
    nb.notice(src.files.length ? "" : t("Getting the image…"));
    const { saved, failed } = await saveImages(store, src);
    if (saved.length) snapshot();
    for (const img of saved) {
      nb.index.addFile(img.path);
      const node: CanvasNode = { id: newId(), type: "file", file: img.path, x: Math.max(0, x), y: Math.max(0, y), width: 400, height: 300 };
      change((ns) => [...ns, node], false);
      y += 320;
    }
    nb.notice(failed.length ? t("Could not add the image ({0}). Try right-click → Copy image in the browser, then paste here.", failed[0]) : "");
  };

  const addCard = (type: CardType) => {
    const id = newId();
    setFocusId("");
    change((ns) => [...ns, { id, type: "text", text: newCardText(type), x: 40, y: bottomOf() + 30, width: 460, height: 200 }]);
    requestAnimationFrame(() => boxEls.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  // ---------- pointer work: moving, resizing, selecting, drawing arrows ----------
  const track = (e: RPointerEvent, move: (ev: PointerEvent, dx: number, dy: number) => void, up?: (ev: PointerEvent, moved: boolean) => void) => {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / zoomRef.current;
      const dy = (ev.clientY - sy) / zoomRef.current;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      move(ev, dx, dy);
    };
    const onUp = (ev: PointerEvent) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      up?.(ev, moved);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  const startMove = (e: RPointerEvent, node: CanvasNode) => {
    if ((e.target as HTMLElement).closest("button") || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelEdge(null);
    let group = selected;
    if (e.shiftKey) {
      group = new Set(selected);
      if (group.has(node.id)) group.delete(node.id);
      else group.add(node.id);
      setSelected(group);
      return;
    }
    if (!group.has(node.id)) {
      group = new Set([node.id]);
      setSelected(group);
    }
    const start = new Map((docRef.current?.nodes ?? []).filter((n) => group.has(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
    let first = true;
    track(e, (_ev, dx, dy) => {
      change((ns) => ns.map((n) => (start.has(n.id) ? { ...n, x: Math.max(0, start.get(n.id)!.x + dx), y: Math.max(0, start.get(n.id)!.y + dy) } : n)), first);
      first = false;
    });
  };

  const startResize = (e: RPointerEvent, node: CanvasNode, corner: boolean) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const w = node.width;
    const h = heights[node.id] ?? node.height;
    let first = true;
    track(e, (_ev, dx, dy) => {
      const p: Partial<CanvasNode> = { width: Math.max(140, w + dx) };
      if (corner) Object.assign(p, { height: Math.max(40, h + dy), fixedHeight: true });
      patch(node.id, p, first);
      first = false;
    });
  };

  const startLink = (e: RPointerEvent, node: CanvasNode, side: Side) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const p0 = sidePoint(rectOf(node), side);
    setLinking({ from: node.id, side, x: p0.x, y: p0.y });
    track(
      e,
      (ev) => {
        const p = toPage(ev.clientX, ev.clientY);
        setLinking({ from: node.id, side, x: p.x, y: p.y });
      },
      (ev, moved) => {
        setLinking(null);
        if (!moved) return;
        const hit = document.elementsFromPoint(ev.clientX, ev.clientY).map((el) => (el as HTMLElement).closest?.(".box") as HTMLElement | null).find((el) => el && el.dataset.id !== node.id);
        const to = hit?.dataset.id;
        const toNode = docRef.current?.nodes.find((n) => n.id === to);
        if (!toNode) return;
        const edge: CanvasEdge = { id: newId(), fromNode: node.id, fromSide: side, toNode: toNode.id, toSide: nearestSide(rectOf(toNode), toPage(ev.clientX, ev.clientY)) };
        update((d) => ({ ...d, edges: [...d.edges, edge] }));
        setSelEdge(edge.id);
      },
    );
  };

  /** Empty space: a click writes a new box, a drag selects the boxes it covers. */
  const startSurface = (e: RPointerEvent) => {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    const p0 = toPage(e.clientX, e.clientY);
    const add = e.shiftKey;
    const before = selected;
    track(
      e,
      (ev) => {
        const p = toPage(ev.clientX, ev.clientY);
        const r = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), width: Math.abs(p.x - p0.x), height: Math.abs(p.y - p0.y) };
        setBand(r);
        const hit = (docRef.current?.nodes ?? []).filter((n) => intersects(r, rectOf(n))).map((n) => n.id);
        setSelected(new Set([...(add ? before : []), ...hit]));
      },
      (_ev, moved) => {
        setBand(null);
        if (moved) return;
        setSelEdge(null);
        if (selected.size) {
          setSelected(new Set());
          return;
        }
        const id = newId();
        setFocusId(id);
        change((ns) => [...ns, { id, type: "text", text: "", x: Math.max(0, p0.x - 14), y: Math.max(0, p0.y - 30), width: 420, height: 40 }]);
      },
    );
  };

  const dropHandlers = {
    onDragOverCapture: (e: React.DragEvent) => {
      if (!mightHaveImages(e.dataTransfer)) return;
      e.preventDefault();
      setDropping(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
    },
    // Capture, so a drop on a text box makes an image box instead of the editor pasting a web link.
    onDropCapture: (e: React.DragEvent) => {
      setDropping(false);
      const src = collectImages(e.dataTransfer);
      if (!src.files.length && !src.urls.length) return;
      e.preventDefault();
      e.stopPropagation();
      const p = surface.current ? toPage(e.clientX, e.clientY) : { x: 40, y: bottomOf() + 30 };
      void addImages(src, p.x - 20, p.y - 20);
    },
    onPasteCapture: (e: React.ClipboardEvent) => {
      const src = collectImages(e.clipboardData);
      if (!src.files.length) return; // plain text or links: let the text box handle it
      e.preventDefault();
      e.stopPropagation();
      void addImages({ files: src.files, urls: [] }, 40, bottomOf() + 30);
    },
  };

  if (error) return <div className="page-message">{error}</div>;
  if (!doc) return <div className="page-message">{t("Loading…")}</div>;

  const right = Math.max(0, ...doc.nodes.map((n) => n.x + n.width));
  const bottom = Math.max(0, ...doc.nodes.map((n) => n.y + (heights[n.id] ?? n.height)));
  const W = right + 800;
  const H = bottom + 800;
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const edge = selEdge ? doc.edges.find((x) => x.id === selEdge) : undefined;
  const groups = doc.nodes.filter((n) => n.type === "group");
  const boxes = doc.nodes.filter((n) => n.type !== "group");

  const edgeGeometry = (x: CanvasEdge) => {
    const a = byId.get(x.fromNode);
    const b = byId.get(x.toNode);
    if (!a || !b) return null;
    const ra = rectOf(a);
    const rb = rectOf(b);
    const [fs, ts] = facingSides(ra, rb);
    const as = x.fromSide ?? fs;
    const bs = x.toSide ?? ts;
    const p = sidePoint(ra, as);
    const q = sidePoint(rb, bs);
    return { d: edgePath(p, as, q, bs), mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
  };

  return (
    <>
      <div className="page-toolbar">
        <span className="seg">
          <button onClick={undo} disabled={!undoStack.length} title={t("Undo (Ctrl+Z)")} aria-label={t("Undo")}>
            ↶
          </button>
          <button onClick={redo} disabled={!redoStack.length} title={t("Redo (Ctrl+Y)")} aria-label={t("Redo")}>
            ↷
          </button>
        </span>
        {nb.config.cardTypes.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const ct = nb.config.cardTypes.find((c) => c.id === e.target.value);
              if (ct) addCard(ct);
            }}
            aria-label={t("Add a card")}
          >
            <option value="">{t("+ Card…")}</option>
            {nb.config.cardTypes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <LinkButton onPicked={linkTo} />
        <button onClick={() => fileInput.current?.click()}>{t("+ Image")}</button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addImages({ files: Array.from(e.target.files ?? []), urls: [] }, 40, bottomOf() + 30);
            e.target.value = "";
          }}
        />
        <span className="seg">
          <button onClick={() => stepZoom(-1)} aria-label={t("Zoom out")}>
            −
          </button>
          <button onClick={() => zoomTo(1)} title={t("Back to 100%")}>
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => stepZoom(1)} aria-label={t("Zoom in")}>
            +
          </button>
          <button onClick={fitAll} title={t("Show the whole page")}>
            {t("Fit")}
          </button>
        </span>
        {selected.size > 1 && (
          <span className="small">
            {t("{0} boxes selected", selected.size)}{" "}
            <button className="quiet small" onClick={() => removeNodes(selected)}>
              {t("Delete")}
            </button>
          </span>
        )}
        <span className="toolbar-right">
          <TagBar
            tags={propertyTags((doc as { tags?: unknown }).tags)}
            onChange={(tags) => update((d) => ({ ...d, tags: tags.length ? tags : undefined }))}
          />
        </span>
      </div>
      <FormatBar />
      <div ref={scroller} className={"canvas-scroll" + (dropping ? " dropping" : "")} {...dropHandlers}>
        <div className="canvas-zoom" style={{ width: W * zoom, height: H * zoom }}>
          <div
            ref={surface}
            className="canvas-surface"
            style={{ width: W, height: H, transform: `scale(${zoom})` }}
            onPointerDown={startSurface}
          >
            {doc.nodes.length === 0 && <div className="canvas-hint">{t("Click anywhere and start typing")}</div>}
            {groups.map((g) => (
              <div
                key={g.id}
                className={"group-box" + (selected.has(g.id) ? " selected" : "")}
                style={{ left: g.x, top: g.y, width: g.width, height: g.height }}
                onPointerDown={(e) => startMove(e, g)}
              >
                {typeof g.label === "string" && <span className="group-label">{g.label}</span>}
              </div>
            ))}
            <svg className="edges" width={W} height={H}>
              <defs>
                <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
                </marker>
              </defs>
              {doc.edges.map((x) => {
                const g = edgeGeometry(x);
                if (!g) return null;
                return (
                  <g key={x.id} className={"edge" + (selEdge === x.id ? " selected" : "")}>
                    <path className="edge-hit" d={g.d} onPointerDown={(e) => (e.stopPropagation(), setSelEdge(x.id), setSelected(new Set()))} />
                    <path
                      className="edge-line"
                      d={g.d}
                      style={x.color && x.color.startsWith("#") ? { stroke: x.color } : undefined}
                      markerEnd={x.toEnd === "none" ? undefined : "url(#arrowhead)"}
                      markerStart={x.fromEnd === "arrow" ? "url(#arrowhead)" : undefined}
                    />
                    {x.label && (
                      <foreignObject x={g.mid.x - 80} y={g.mid.y - 14} width={160} height={28} className="edge-label-wrap">
                        <div className="edge-label">{x.label}</div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
              {linking && (() => {
                const a = byId.get(linking.from);
                if (!a) return null;
                const p = sidePoint(rectOf(a), linking.side);
                return <line className="edge-draft" x1={p.x} y1={p.y} x2={linking.x} y2={linking.y} />;
              })()}
            </svg>
            {boxes.map((n) => {
              const isText = n.type === "text";
              const { front, body } = isText ? splitFrontmatter(n.text ?? "") : { front: "", body: "" };
              const data = front ? frontData(front) : {};
              const cardId = typeof data.card === "string" ? data.card : "";
              const cardType = nb.config.cardTypes.find((c) => c.id === cardId);
              const secret = n.secret === true || data.secret === true;
              return (
                <div
                  key={n.id}
                  data-id={n.id}
                  className={"box box-" + n.type + (cardId ? " box-card" : "") + (secret ? " secret" : "") + (selected.has(n.id) ? " selected" : "")}
                  style={{
                    left: n.x,
                    top: n.y,
                    width: n.width,
                    minHeight: !isText || n.fixedHeight ? n.height : undefined,
                    ["--card" as string]: cardType?.color,
                  }}
                  ref={(el) => {
                    if (el) boxEls.current.set(n.id, el);
                    else boxEls.current.delete(n.id);
                  }}
                >
                  <div className="box-bar" onPointerDown={(e) => startMove(e, n)} title={t("Drag to move. Shift-click to select several.")}>
                    {cardId && <span className="card-label">{cardType?.name ?? cardId}</span>}
                    <span className="box-grip">⋯⋯</span>
                    <span className="box-buttons">
                      <button
                        className={"box-btn" + (n.secret ? " on" : "")}
                        title={n.secret ? t("Secret: hidden in player-safe mode") : t("Make secret (hidden in player-safe mode)")}
                        onClick={() => patch(n.id, { secret: n.secret ? undefined : true })}
                      >
                        ◑
                      </button>
                      <button className="box-btn" title={t("Remove box")} onClick={() => removeNodes(new Set([n.id]))}>
                        ×
                      </button>
                    </span>
                  </div>
                  {isText && cardId && (
                    <CardBox
                      key={revs[n.id] ?? 0}
                      type={cardType}
                      front={front}
                      body={body}
                      onText={(text) => patch(n.id, { text }, false)}
                      onError={(m) => nb.notice(m)}
                    />
                  )}
                  {isText && !cardId && (
                    <RichText
                      key={revs[n.id] ?? 0}
                      initial={n.text ?? ""}
                      autoFocus={n.id === focusId}
                      onChange={(text) => patch(n.id, { text }, false)}
                      onBlur={(empty) => {
                        if (!empty) return;
                        // An empty new box just disappears; it does not need an undo step.
                        setDoc((d) => (d ? { ...d, nodes: d.nodes.filter((x) => x.id !== n.id) } : d));
                        markDirty();
                      }}
                    />
                  )}
                  {n.type === "file" && <FileBox store={store} file={n.file ?? ""} />}
                  {n.type === "link" && (
                    <a className="box-other" href={String(n.url ?? "")} target="_blank" rel="noreferrer">
                      {String(n.url ?? "")}
                    </a>
                  )}
                  {!isText && n.type !== "file" && n.type !== "link" && <div className="box-other">{t("{0} box (kept, not shown yet)", n.type)}</div>}
                  {SIDES.map((s) => (
                    <span key={s} className={"box-dot dot-" + s} title={t("Drag to another box to draw an arrow")} onPointerDown={(e) => startLink(e, n, s)} />
                  ))}
                  <div className="box-resize" onPointerDown={(e) => startResize(e, n, false)} title={t("Drag to change width")} />
                  <div className="box-corner" onPointerDown={(e) => startResize(e, n, true)} title={t("Drag to change size")} />
                </div>
              );
            })}
            {band && <div className="band" style={{ left: band.x, top: band.y, width: band.width, height: band.height }} />}
            {edge && (() => {
              const g = edgeGeometry(edge);
              if (!g) return null;
              return (
                <div className="edge-tools" style={{ left: g.mid.x, top: g.mid.y + 16 }} onPointerDown={(e) => e.stopPropagation()}>
                  <input
                    placeholder={t("Label")}
                    defaultValue={edge.label ?? ""}
                    key={edge.id}
                    onFocus={() => snapshot()}
                    onChange={(e) => update((d) => ({ ...d, edges: d.edges.map((x) => (x.id === edge.id ? { ...x, label: e.target.value || undefined } : x)) }), false)}
                  />
                  <button
                    title={t("Arrow at both ends")}
                    onClick={() => update((d) => ({ ...d, edges: d.edges.map((x) => (x.id === edge.id ? { ...x, fromEnd: x.fromEnd === "arrow" ? undefined : "arrow" } : x)) }))}
                  >
                    ↔
                  </button>
                  <button
                    className="quiet"
                    title={t("Delete arrow")}
                    onClick={() => {
                      update((d) => ({ ...d, edges: d.edges.filter((x) => x.id !== edge.id) }));
                      setSelEdge(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}

function CardBox(props: { type?: CardType; front: string; body: string; onText: (t: string) => void; onError: (m: string) => void }) {
  const front = useRef(props.front);
  const body = useRef(props.body);
  front.current = props.front;
  return (
    <div className="card">
      <CardFields
        type={props.type}
        data={frontData(props.front)}
        onChange={(key, value) => {
          try {
            front.current = setFrontField(front.current, key, value);
            props.onText(front.current + body.current);
          } catch (e) {
            props.onError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
      <RichText
        initial={props.body}
        onChange={(md) => {
          body.current = md.trim() ? "\n" + md : "";
          props.onText(front.current + body.current);
        }}
      />
    </div>
  );
}

function FileBox({ store, file }: { store: Store; file: string }) {
  const [url, setUrl] = useState(imageCache.get(file) ?? "");
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!isImage(file) || imageCache.get(file)) return;
    let alive = true;
    store.readBytes(file).then(
      (bytes) => {
        const type = file.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "";
        const made = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
        imageCache.set(file, made);
        if (alive) setUrl(made);
      },
      () => alive && setMissing(true),
    );
    return () => {
      alive = false;
    };
  }, [store, file]);
  if (isImage(file) && url) return <img src={url} alt={basename(file)} draggable={false} />;
  return <div className="box-other">{missing ? "Missing file: " : ""}{basename(file)}</div>;
}
