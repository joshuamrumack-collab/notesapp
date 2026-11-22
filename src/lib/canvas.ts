// JSON Canvas (https://jsoncanvas.org) reading and writing. Unknown nodes, edges and fields are kept as they are.
export interface CanvasNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  [key: string]: unknown;
}

export interface CanvasDoc {
  nodes: CanvasNode[];
  edges: unknown[];
  [key: string]: unknown;
}

export function parseCanvas(src: string): CanvasDoc {
  if (!src.trim()) return { nodes: [], edges: [] };
  const raw = JSON.parse(src) as Partial<CanvasDoc>;
  return { ...raw, nodes: Array.isArray(raw.nodes) ? raw.nodes : [], edges: Array.isArray(raw.edges) ? raw.edges : [] };
}

export function serializeCanvas(doc: CanvasDoc): string {
  const nodes = doc.nodes.map((n) => ({
    ...n,
    x: Math.round(n.x),
    y: Math.round(n.y),
    width: Math.round(n.width),
    height: Math.round(n.height),
  }));
  return JSON.stringify({ ...doc, nodes }, null, "\t") + "\n";
}

export const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

export const isImage = (path: string) => /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(path);
