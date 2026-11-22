import { useEffect, useRef, useState } from "react";
import { useNB, type PageProps } from "../context";
import { useAutosave } from "../lib/autosave";
import { defaultValue } from "../lib/cards";
import { type Data, frontData, frontInner, isScalar, makeFront, setFrontField, splitFrontmatter, validYaml, wrapFront } from "../lib/frontmatter";
import { basename, join } from "../lib/storage";
import type { Editor } from "@tiptap/core";
import { bridge } from "../lib/bridge";
import { CardFields } from "./CardFields";
import { LinkButton, insertLink } from "./PagePicker";
import { TagBar } from "./TagBar";
import { propertyTags } from "../lib/links";
import { type ImageSource, collectImages, mightHaveImages, saveImages } from "../lib/dropImages";
import { RichText } from "./RichText";

/** A plain Markdown note shown as one full-width text box, with its properties on top. */
export function MarkdownPage({ store, path, onState, flushRef, onSaved, noBackup }: PageProps) {
  const nb = useNB();
  const [loaded, setLoaded] = useState(false);
  const [front, setFront] = useState("");
  const [initialBody, setInitialBody] = useState("");
  const [error, setError] = useState("");
  const original = useRef("");
  const frontRef = useRef("");
  const body = useRef("");
  const backedUp = useRef(false);
  const editor = useRef<Editor | null>(null);
  const [dropping, setDropping] = useState(false);

  /** Save images and put ![[name]] where they were dropped (or at the cursor when pasted). */
  const addImages = async (src: ImageSource, at: { x: number; y: number } | null) => {
    const ed = editor.current;
    if (!ed) return;
    const pos = at ? ed.view.posAtCoords({ left: at.x, top: at.y })?.pos : undefined;
    if (!src.files.length) nb.notice("Getting the image…");
    const { saved, failed } = await saveImages(store, src);
    if (saved.length) {
      for (const img of saved) nb.index.addFile(img.path);
      const text = saved.map((img) => `![[${img.name}]]`).join(" ");
      if (pos !== undefined) ed.chain().focus().insertContentAt(pos, text).run();
      else ed.chain().focus().insertContent(text).run();
    }
    nb.notice(failed.length ? `Could not add the image (${failed[0]}). Try right-click → Copy image in the browser, then paste here.` : "");
  };

  const { markDirty, flush } = useAutosave(async () => {
    if (!loaded) return;
    // Keep a copy of the note as it was before this app first changed it.
    if (!noBackup && !backedUp.current && original.current.trim()) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await store.writeText(join("_trash", "backups", `${basename(path)}.${stamp}.md`), original.current);
    }
    backedUp.current = true;
    const text = frontRef.current + body.current.replace(/\s*$/, "\n");
    await store.writeText(path, text);
    onSaved?.(text);
  }, onState);
  flushRef.current = flush;

  useEffect(() => {
    let alive = true;
    store.readText(path).then(
      (src) => {
        if (!alive) return;
        original.current = src;
        const parts = splitFrontmatter(src);
        frontRef.current = parts.front;
        body.current = parts.body;
        setFront(parts.front);
        setInitialBody(parts.body);
        setLoaded(true);
      },
      (e) => alive && setError(String(e)),
    );
    return () => {
      alive = false;
    };
  }, [store, path]);

  const updateFront = (next: string) => {
    frontRef.current = next;
    setFront(next);
    markDirty();
  };

  if (error) return <div className="page-message">{error}</div>;
  if (!loaded) return <div className="page-message">Loading…</div>;
  return (
    <>
    <div className="page-toolbar">
      <LinkButton
        onPicked={(path) => {
          const ed = editor.current;
          if (!ed) return;
          // At the cursor if the user was typing here, otherwise at the end of the note.
          if (bridge.activeEditor !== ed) ed.commands.focus("end");
          insertLink(ed, nb.index.linkTo(path));
        }}
      />
      <span className="muted small">Or type [[ in the text.</span>
    </div>
    <div
      className={"md-scroll" + (dropping ? " dropping" : "")}
      onDragOverCapture={(e) => {
        if (!mightHaveImages(e.dataTransfer)) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDropCapture={(e) => {
        setDropping(false);
        const src = collectImages(e.dataTransfer);
        if (!src.files.length && !src.urls.length) return;
        e.preventDefault();
        e.stopPropagation();
        void addImages(src, { x: e.clientX, y: e.clientY });
      }}
      onPasteCapture={(e) => {
        const src = collectImages(e.clipboardData);
        if (!src.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        void addImages({ files: src.files, urls: [] }, null);
      }}
    >
      <div className="md-page">
        <TagBar
          tags={propertyTags(frontData(front).tags)}
          onChange={(tags) => {
            try {
              updateFront(setFrontField(front, "tags", tags.length ? tags : undefined));
            } catch (e) {
              nb.notice(e instanceof Error ? e.message : String(e));
            }
          }}
        />
        <Properties front={front} onChange={updateFront} onError={nb.notice} />
        <RichText
          initial={initialBody}
          editorRef={editor}
          onChange={(md) => {
            body.current = md;
            markDirty();
          }}
        />
      </div>
    </div>
    </>
  );
}

function Properties({ front, onChange, onError }: { front: string; onChange: (f: string) => void; onError: (m: string) => void }) {
  const nb = useNB();
  const [raw, setRaw] = useState<string | null>(null);
  const data: Data = frontData(front);
  const cardId = typeof data.card === "string" ? data.card : "";
  const type = nb.config.cardTypes.find((c) => c.id === cardId);
  const set = (key: string, value: unknown) => {
    try {
      onChange(setFrontField(front, key, value));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!front) {
    if (!nb.config.cardTypes.length) return null;
    return (
      <div className="props-empty">
        <select
          value=""
          aria-label="Make this page a card"
          onChange={(e) => {
            const t = nb.config.cardTypes.find((c) => c.id === e.target.value);
            if (!t) return;
            const d: Data = { card: t.id };
            for (const f of t.fields) d[f.key] = defaultValue(f);
            onChange(makeFront(d));
          }}
        >
          <option value="">Make this page a card…</option>
          {nb.config.cardTypes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (raw !== null) {
    const ok = validYaml(raw);
    return (
      <div className="props" style={{ ["--card" as string]: type?.color }}>
        <div className="props-head">
          <span>Properties (YAML)</span>
          <button
            disabled={!ok}
            onClick={() => {
              onChange(wrapFront(raw));
              setRaw(null);
            }}
          >
            Done
          </button>
        </div>
        <textarea className="props-raw" rows={Math.max(4, raw.split("\n").length + 1)} value={raw} onChange={(e) => setRaw(e.target.value)} />
        {!ok && <div className="error">This is not valid YAML yet, so it will not be saved.</div>}
      </div>
    );
  }

  const complex = Object.entries(data).filter(([k, v]) => k !== "card" && k !== "tags" && !isScalar(v) && !type?.fields.some((f) => f.key === k));
  return (
    <div className={"props" + (cardId ? " props-card" : "")} style={{ ["--card" as string]: type?.color }}>
      <div className="props-head">
        <span>{cardId ? (type?.name ?? cardId) + " card" : "Properties"}</span>
        <button className="quiet" onClick={() => setRaw(frontInner(front))}>
          Edit as text
        </button>
      </div>
      <CardFields type={type} data={data} onChange={set} />
      {complex.length > 0 && (
        <div className="props-complex">
          {complex.map(([k, v]) => (
            <div key={k}>
              <span className="muted">{k}:</span> {Array.isArray(v) ? v.join(", ") : JSON.stringify(v)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
