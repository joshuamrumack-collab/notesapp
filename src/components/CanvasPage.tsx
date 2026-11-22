import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useNB, type PageProps } from "../context";
import { type SaveState, useAutosave } from "../lib/autosave";
import { type CanvasDoc, type CanvasNode, isImage, newId, parseCanvas, serializeCanvas } from "../lib/canvas";
import { newCardText } from "../lib/cards";
import { frontData, setFrontField, splitFrontmatter } from "../lib/frontmatter";
import type { CardType } from "../lib/kits";
import { type Store, basename } from "../lib/storage";
import { type ImageSource, collectImages, mightHaveImages, saveImages } from "../lib/dropImages";
import { imageCache } from "../lib/bridge";
import { CardFields } from "./CardFields";
import { LinkButton, insertLink } from "./PagePicker";
import { bridge } from "../lib/bridge";
import { RichText } from "./RichText";

export { ATTACHMENTS } from "../lib/dropImages";

export function CanvasPage({ store, path, onState, flushRef, onSaved }: PageProps) {
  const nb = useNB();
  const [doc, setDoc] = useState<CanvasDoc | null>(null);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState("");
  const docRef = useRef<CanvasDoc | null>(null);
  docRef.current = doc;
  const boxEls = useRef(new Map<string, HTMLElement>());
  const fileInput = useRef<HTMLInputElement>(null);
  const surface = useRef<HTMLDivElement>(null);

  const linkTo = (target: string) => {
    const inner = nb.index.linkTo(target);
    const ed = bridge.activeEditor;
    // Insert where the cursor is, if it is in a box on this page; otherwise add a new box with the link.
    if (ed && !ed.isDestroyed && surface.current?.contains(ed.view.dom) && insertLink(ed, inner)) return;
    const id = newId();
    change((ns) => [...ns, { id, type: "text", text: `[[${inner}]]`, x: 40, y: bottomOf() + 30, width: 320, height: 40 }]);
  };

  const { markDirty, flush } = useAutosave(
    async () => {
      const d = docRef.current;
      if (!d) return;
      const nodes = d.nodes.map((n) => {
        const el = boxEls.current.get(n.id);
        return el ? { ...n, height: el.offsetHeight } : n;
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
          setError("This file is not a valid canvas file, so it was left untouched.");
        }
      },
      (e) => alive && setError(String(e)),
    );
    return () => {
      alive = false;
    };
  }, [store, path]);

  const change = (fn: (nodes: CanvasNode[]) => CanvasNode[]) => {
    setDoc((d) => (d ? { ...d, nodes: fn(d.nodes) } : d));
    markDirty();
  };
  const patch = (id: string, p: Partial<CanvasNode>) => change((ns) => ns.map((n) => (n.id === id ? { ...n, ...p } : n)));
  const remove = (id: string) => change((ns) => ns.filter((n) => n.id !== id));
  const bottomOf = () => Math.max(0, ...(docRef.current?.nodes ?? []).map((n) => n.y + n.height));

  const [dropping, setDropping] = useState(false);

  /** Save dropped or pasted images and put each one on the page as an image box. */
  const addImages = async (src: ImageSource, x: number, y: number) => {
    if (!src.files.length && !src.urls.length) return;
    nb.notice(src.files.length ? "" : "Getting the image…");
    const { saved, failed } = await saveImages(store, src);
    for (const img of saved) {
      nb.index.addFile(img.path);
      const node: CanvasNode = { id: newId(), type: "file", file: img.path, x: Math.max(0, x), y: Math.max(0, y), width: 400, height: 300 };
      change((ns) => [...ns, node]);
      y += 320;
    }
    nb.notice(failed.length ? `Could not add the image (${failed[0]}). Try right-click → Copy image in the browser, then paste here.` : "");
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
      const rect = surface.current?.getBoundingClientRect();
      void addImages(src, rect ? e.clientX - rect.left - 20 : 40, rect ? e.clientY - rect.top - 20 : bottomOf() + 30);
    },
    onPasteCapture: (e: React.ClipboardEvent) => {
      const src = collectImages(e.clipboardData);
      if (!src.files.length) return; // plain text or links: let the text box handle it
      e.preventDefault();
      e.stopPropagation();
      void addImages({ files: src.files, urls: [] }, 40, bottomOf() + 30);
    },
  };

  const addCard = (type: CardType) => {
    const id = newId();
    setFocusId("");
    change((ns) => [...ns, { id, type: "text", text: newCardText(type), x: 40, y: bottomOf() + 30, width: 460, height: 200 }]);
    requestAnimationFrame(() => boxEls.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  /** Start dragging: move the box, or change its width. */
  const startDrag = (e: RPointerEvent, node: CanvasNode, mode: "move" | "resize") => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (mode === "move") patch(node.id, { x: Math.max(0, node.x + dx), y: Math.max(0, node.y + dy) });
      else patch(node.id, { width: Math.max(140, node.width + dx) });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  if (error) return <div className="page-message">{error}</div>;
  if (!doc) return <div className="page-message">Loading…</div>;

  const right = Math.max(0, ...doc.nodes.map((n) => n.x + n.width));
  const bottom = Math.max(0, ...doc.nodes.map((n) => n.y + n.height));

  return (
    <>
      <div className="page-toolbar">
        {nb.config.cardTypes.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const t = nb.config.cardTypes.find((c) => c.id === e.target.value);
              if (t) addCard(t);
            }}
            aria-label="Add a card"
          >
            <option value="">+ Card…</option>
            {nb.config.cardTypes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <LinkButton onPicked={linkTo} />
        <button onClick={() => fileInput.current?.click()}>+ Image</button>
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
        <span className="muted small">Click empty space to write. Drop or paste images, from your files or a web page.</span>
      </div>
      <div className={"canvas-scroll" + (dropping ? " dropping" : "")} {...dropHandlers}>
        <div
          ref={surface}
          className="canvas-surface"
          style={{ width: right + 800, height: bottom + 800 }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const id = newId();
            const x = Math.max(0, e.nativeEvent.offsetX - 14);
            const y = Math.max(0, e.nativeEvent.offsetY - 30);
            setFocusId(id);
            change((ns) => [...ns, { id, type: "text", text: "", x, y, width: 420, height: 40 }]);
          }}
        >
          {doc.nodes.length === 0 && <div className="canvas-hint">Click anywhere and start typing</div>}
          {doc.nodes.map((n) => {
            const isText = n.type === "text";
            const { front, body } = isText ? splitFrontmatter(n.text ?? "") : { front: "", body: "" };
            const data = front ? frontData(front) : {};
            const cardId = typeof data.card === "string" ? data.card : "";
            const cardType = nb.config.cardTypes.find((c) => c.id === cardId);
            const secret = n.secret === true || data.secret === true;
            return (
              <div
                key={n.id}
                className={"box box-" + n.type + (cardId ? " box-card" : "") + (secret ? " secret" : "")}
                style={{ left: n.x, top: n.y, width: n.width, minHeight: isText ? undefined : n.height, ["--card" as string]: cardType?.color }}
                ref={(el) => {
                  if (el && isText) boxEls.current.set(n.id, el);
                  else boxEls.current.delete(n.id);
                }}
              >
                <div className="box-bar" onPointerDown={(e) => startDrag(e, n, "move")} title="Drag to move">
                  {cardId && <span className="card-label">{cardType?.name ?? cardId}</span>}
                  <span className="box-grip">⋯⋯</span>
                  <span className="box-buttons">
                    <button
                      className={"box-btn" + (n.secret ? " on" : "")}
                      title={n.secret ? "Secret: hidden in player-safe mode" : "Make secret (hidden in player-safe mode)"}
                      onClick={() => patch(n.id, { secret: n.secret ? undefined : true })}
                    >
                      ◑
                    </button>
                    <button className="box-btn" title="Remove box" onClick={() => remove(n.id)}>
                      ×
                    </button>
                  </span>
                </div>
                {isText && cardId && (
                  <CardBox
                    type={cardType}
                    front={front}
                    body={body}
                    onText={(text) => patch(n.id, { text })}
                    onError={(m) => nb.notice(m)}
                  />
                )}
                {isText && !cardId && (
                  <RichText
                    initial={n.text ?? ""}
                    autoFocus={n.id === focusId}
                    onChange={(text) => patch(n.id, { text })}
                    onBlur={(empty) => empty && remove(n.id)}
                  />
                )}
                {n.type === "file" && <FileBox store={store} file={n.file ?? ""} />}
                {n.type === "link" && (
                  <a className="box-other" href={String(n.url ?? "")} target="_blank" rel="noreferrer">
                    {String(n.url ?? "")}
                  </a>
                )}
                {!isText && n.type !== "file" && n.type !== "link" && <div className="box-other">{n.type} box (kept, not shown yet)</div>}
                <div className="box-resize" onPointerDown={(e) => startDrag(e, n, "resize")} title="Drag to change width" />
              </div>
            );
          })}
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
