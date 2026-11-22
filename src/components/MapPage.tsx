import { useEffect, useRef, useState } from "react";
import { type PageProps, useNB } from "../context";
import { useAutosave } from "../lib/autosave";
import { bridge, imageCache } from "../lib/bridge";
import { newId } from "../lib/canvas";
import { collectImages, mightHaveImages, saveImages, type ImageSource } from "../lib/dropImages";
import { singleLink, linkLabel, propertyTags } from "../lib/links";
import { type MapDoc, type Pin, parseMap, serializeMap } from "../lib/map";
import { ext, stem } from "../lib/storage";
import { PagePicker } from "./PagePicker";
import { TagBar } from "./TagBar";

const PIN_COLORS = ["#c0392b", "#1f7a6d", "#2f6fb5", "#a37a1b", "#6b4fa3", "#333333"];

/**
 * A map page: a picture with pins. Each pin links to a page, or to another map for a closer look
 * (town inside region inside world). Hover a pin for a preview, click it to open the page.
 */
export function MapPage({ store, path, onState, flushRef, onSaved }: PageProps) {
  const nb = useNB();
  const [doc, setDoc] = useState<MapDoc | null>(null);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [mode, setMode] = useState<"view" | "pin" | "edit">("view");
  const [placing, setPlacing] = useState<{ x: number; y: number; px: number; py: number; pinId?: string } | null>(null);
  const [dropping, setDropping] = useState(false);
  const docRef = useRef<MapDoc | null>(null);
  docRef.current = doc;
  const frame = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { markDirty, flush } = useAutosave(async () => {
    if (!docRef.current) return;
    const text = serializeMap(docRef.current);
    await store.writeText(path, text);
    onSaved?.(text);
  }, onState);
  flushRef.current = flush;

  useEffect(() => {
    let alive = true;
    store.readText(path).then(
      (src) => {
        try {
          if (alive) setDoc(parseMap(src));
        } catch {
          if (alive) setError("This file is not a map file, so it was left untouched.");
        }
      },
      (e) => alive && setError(String(e)),
    );
    return () => {
      alive = false;
    };
  }, [store, path]);

  // Load the picture.
  useEffect(() => {
    if (!doc?.image) return setUrl("");
    const cached = imageCache.get(doc.image);
    if (cached) return setUrl(cached);
    let alive = true;
    store.readBytes(doc.image).then(
      (bytes) => {
        const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: doc.image!.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "" }));
        imageCache.set(doc.image!, u);
        if (alive) setUrl(u);
      },
      () => alive && setError(`The map picture ${doc.image} is missing.`),
    );
    return () => {
      alive = false;
    };
  }, [store, doc?.image]);

  const change = (fn: (d: MapDoc) => MapDoc) => {
    setDoc((d) => (d ? fn(d) : d));
    markDirty();
  };
  const patchPin = (id: string, p: Partial<Pin>) => change((d) => ({ ...d, pins: d.pins.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

  const fit = () => {
    const f = frame.current;
    if (!f || !natural.w) return;
    const zoom = Math.min(f.clientWidth / natural.w, f.clientHeight / natural.h, 4);
    setView({ zoom, x: (f.clientWidth - natural.w * zoom) / 2, y: (f.clientHeight - natural.h * zoom) / 2 });
  };
  useEffect(fit, [natural.w, natural.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const setImage = async (src: ImageSource) => {
    const { saved, failed } = await saveImages(store, src);
    if (saved[0]) {
      nb.index.addFile(saved[0].path);
      change((d) => ({ ...d, image: saved[0].path }));
    } else if (failed[0]) nb.notice(`Could not use that picture (${failed[0]}).`);
  };

  const zoomAt = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      const zoom = Math.min(8, Math.max(0.05, v.zoom * factor));
      const k = zoom / v.zoom;
      return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });

  /** Pointer position as a fraction of the picture. */
  const toMap = (clientX: number, clientY: number) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / (natural.w * view.zoom), y: (clientY - r.top - view.y) / (natural.h * view.zoom), px: clientX - r.left, py: clientY - r.top };
  };

  const startPan = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const start = view;
    let moved = false;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) moved = true;
      if (moved) setView({ ...start, x: start.x + ev.clientX - sx, y: start.y + ev.clientY - sy });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      if (!moved && mode === "pin" && natural.w) {
        const p = toMap(ev.clientX, ev.clientY);
        if (p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) setPlacing(p);
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const startPinDrag = (e: React.PointerEvent, pin: Pin) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (mode !== "edit") return;
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
      if (moved) {
        const p = toMap(ev.clientX, ev.clientY);
        patchPin(pin.id, { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) });
      }
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      if (moved) return;
      const target = singleLink(pin.target);
      if (mode === "edit") {
        const r = frame.current!.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        setPlacing({ x: pin.x, y: pin.y, px: er.left - r.left, py: er.bottom - r.top, pinId: pin.id });
      } else if (target) bridge.open(target, path);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  if (error) return <div className="page-message">{error}</div>;
  if (!doc) return <div className="page-message">Loading…</div>;
  const parents = nb.index.parentMaps(path);

  return (
    <>
      <div className="page-toolbar">
        <div className="seg">
          <button className={mode === "view" ? "selected" : ""} onClick={() => setMode("view")} title="Click pins to open their pages">
            Explore
          </button>
          <button className={mode === "pin" ? "selected" : ""} disabled={!url} onClick={() => setMode("pin")} title="Click on the map to place a pin">
            + Pin
          </button>
          <button className={mode === "edit" ? "selected" : ""} disabled={!doc.pins.length} onClick={() => setMode("edit")} title="Drag pins to move them, click one to change it">
            Edit pins
          </button>
        </div>
        <button onClick={() => fileInput.current?.click()}>{doc.image ? "Change picture" : "Choose map picture"}</button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void setImage({ files: Array.from(e.target.files ?? []), urls: [] });
            e.target.value = "";
          }}
        />
        <span className="seg">
          <button onClick={() => frame.current && zoomAt(1 / 1.25, frame.current.clientWidth / 2, frame.current.clientHeight / 2)} aria-label="Zoom out">
            −
          </button>
          <button onClick={fit} title="Fit the whole map">
            Fit
          </button>
          <button onClick={() => frame.current && zoomAt(1.25, frame.current.clientWidth / 2, frame.current.clientHeight / 2)} aria-label="Zoom in">
            +
          </button>
        </span>
        {parents.length > 0 && (
          <span className="small">
            Part of:{" "}
            {parents.map((p) => (
              <button key={p} className="link inline" data-preview={stem(p)} onClick={() => nb.openPath(p)}>
                {stem(p)}
              </button>
            ))}
          </span>
        )}
        <span className="toolbar-right">
          <TagBar
            tags={propertyTags(doc.tags)}
            onChange={(tags) => change((d) => ({ ...d, tags: tags.length ? tags : undefined }))}
          />
        </span>
      </div>
      <div
        ref={frame}
        className={"map-frame mode-" + mode + (dropping ? " dropping" : "")}
        onWheel={(e) => {
          const r = frame.current!.getBoundingClientRect();
          zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
        }}
        onPointerDown={startPan}
        onDragOver={(e) => {
          if (!mightHaveImages(e.dataTransfer)) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          setDropping(false);
          const src = collectImages(e.dataTransfer);
          if (!src.files.length && !src.urls.length) return;
          e.preventDefault();
          void setImage(src);
        }}
      >
        {!url && (
          <div className="map-empty">
            <strong>No map picture yet.</strong>
            <span>Drop a picture here (from your files or a web page), or use “Choose map picture”.</span>
          </div>
        )}
        {url && (
          <div className="map-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, width: natural.w || undefined, height: natural.h || undefined }}>
            <img src={url} alt="" draggable={false} onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth || 1200, h: e.currentTarget.naturalHeight || 800 })} />
            {natural.w > 0 &&
              doc.pins.map((pin) => {
                const target = singleLink(pin.target);
                const hit = target ? nb.index.resolve(target, path) : null;
                const isMap = !!hit && ext(hit) === "map";
                const secret = !!hit && nb.index.pages.get(hit)?.secret;
                return (
                  <div
                    key={pin.id}
                    className={"pin" + (isMap ? " pin-map" : "") + (!hit ? " pin-missing" : "") + (secret ? " secret" : "")}
                    style={{ left: pin.x * natural.w, top: pin.y * natural.h, ["--pin" as string]: pin.color ?? PIN_COLORS[0], transform: `translate(-50%, -100%) scale(${1 / view.zoom})` }}
                    data-preview={target ?? undefined}
                    onPointerDown={(e) => startPinDrag(e, pin)}
                    title={isMap ? "Opens a more detailed map" : ""}
                  >
                    <span className="pin-label">{pin.label || (target ? linkLabel(pin.target!) : "Pin")}</span>
                    <span className="pin-dot">{isMap ? "▦" : ""}</span>
                    {mode === "edit" && (
                      <button className="pin-x" onPointerDown={(e) => e.stopPropagation()} onClick={() => change((d) => ({ ...d, pins: d.pins.filter((x) => x.id !== pin.id) }))} aria-label="Remove pin">
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        )}
        {placing && (
          <div className="map-picker" style={{ left: Math.min(placing.px, (frame.current?.clientWidth ?? 400) - 330), top: placing.py + 6 }} onPointerDown={(e) => e.stopPropagation()}>
            {placing.pinId && (
              <div className="pin-colors">
                {PIN_COLORS.map((c) => (
                  <button key={c} style={{ background: c }} aria-label="Pin colour" onClick={() => patchPin(placing.pinId!, { color: c })} />
                ))}
              </div>
            )}
            <PagePicker
              allowMap
              onClose={() => setPlacing(null)}
              onPick={(picked) => {
                const target = `[[${nb.index.linkTo(picked)}]]`;
                const label = nb.index.cards.get(picked)?.[0]?.title ?? stem(picked);
                if (placing.pinId) patchPin(placing.pinId, { target, label });
                else change((d) => ({ ...d, pins: [...d.pins, { id: newId(), x: placing.x, y: placing.y, label, target }] }));
                setPlacing(null);
              }}
            />
          </div>
        )}
      </div>
      <div className="map-hint muted small">
        {mode === "view" && "Drag to move around, scroll to zoom. Click a pin to open its page; ▦ pins open a closer map."}
        {mode === "pin" && "Click where the pin goes, then pick the page it links to (or make a new one, including a new map)."}
        {mode === "edit" && "Drag pins to move them. Click a pin to change its page or colour, × removes it."}
      </div>
    </>
  );
}
