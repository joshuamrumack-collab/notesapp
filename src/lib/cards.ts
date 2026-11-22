// Reading and changing cards, whether a whole .md page or a box on a canvas.
import { parseCanvas, serializeCanvas } from "./canvas";
import { type Data, makeFront, setFrontField, splitFrontmatter } from "./frontmatter";
import type { CardType, FieldDef } from "./kits";
import type { Store } from "./storage";

export function defaultValue(f: FieldDef): unknown {
  if (f.type === "check") return false;
  if (f.type === "links") return [];
  if (f.type === "select") return f.options?.[0] ?? "";
  return "";
}

/** The text of a new card box: properties block plus the card type's body. */
export function newCardText(type: CardType, extra: Data = {}): string {
  const data: Data = { card: type.id };
  for (const f of type.fields) data[f.key] = f.key in extra ? extra[f.key] : f.type === "check" ? false : f.type === "links" ? [] : "";
  return makeFront(data) + (type.body ? "\n" + type.body : "");
}

export function coerce(f: FieldDef | undefined, raw: unknown): unknown {
  if (!f) return raw;
  if (f.type === "number") {
    if (raw === "" || raw === null || raw === undefined) return "";
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (f.type === "check") return raw === true || raw === "true";
  if (f.type === "links") return Array.isArray(raw) ? raw : raw ? [raw] : [];
  return raw ?? "";
}

/** Change one field of a card in its file. Returns the new file content. */
export async function updateCardField(store: Store, ref: { path: string; nodeId?: string }, key: string, value: unknown): Promise<string> {
  const src = await store.readText(ref.path);
  let out: string;
  if (ref.nodeId) {
    const doc = parseCanvas(src);
    const node = doc.nodes.find((n) => n.id === ref.nodeId);
    if (!node || typeof node.text !== "string") throw new Error("That card is no longer on its page.");
    const { front, body } = splitFrontmatter(node.text);
    node.text = setFrontField(front, key, value) + body;
    out = serializeCanvas(doc);
  } else {
    const { front, body } = splitFrontmatter(src);
    out = setFrontField(front, key, value) + body;
  }
  await store.writeText(ref.path, out);
  return out;
}
