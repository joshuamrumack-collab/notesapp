// Frontmatter ("properties") at the top of a Markdown note or card. Edits keep the YAML's own formatting and comments.
import { isMap, parse, parseDocument, stringify } from "yaml";

export type Data = Record<string, unknown>;

const FRONT_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

export function splitFrontmatter(src: string): { front: string; body: string } {
  const m = FRONT_RE.exec(src);
  if (!m) return { front: "", body: src };
  return { front: m[0], body: src.slice(m[0].length) };
}

export function frontInner(front: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/.exec(front);
  return m ? m[1] : "";
}

export function frontData(front: string): Data {
  if (!front) return {};
  try {
    const v = parse(frontInner(front), { logLevel: "error" });
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {};
  } catch {
    return {};
  }
}

/** True if the YAML is valid. */
export function validYaml(inner: string): boolean {
  return parseDocument(inner).errors.length === 0;
}

export function wrapFront(inner: string): string {
  const body = inner.replace(/\s*$/, "");
  return body ? `---\n${body}\n---\n` : "";
}

/** Set (or with undefined, remove) one property. Throws if the existing YAML is broken. */
export function setFrontField(front: string, key: string, value: unknown): string {
  const doc = parseDocument(frontInner(front));
  if (doc.errors.length) throw new Error("The properties block has a YAML error, so it was not changed.");
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  if (value === undefined) doc.delete(key);
  else doc.set(key, value);
  return wrapFront(doc.toString());
}

export function makeFront(data: Data): string {
  return Object.keys(data).length ? wrapFront(stringify(data)) : "";
}

export const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);
