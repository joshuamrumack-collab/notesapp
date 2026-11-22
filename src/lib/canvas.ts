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

export type Side = "top" | "right" | "bottom" | "left";
export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: Side;
  toNode: string;
  toSide?: Side;
  fromEnd?: "none" | "arrow";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
  [key: string]: unknown;
}
export interface CanvasDoc {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  [key: string]: unknown;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where an arrow leaves or enters a box: the middle of a side. */
export function sidePoint(r: Rect, side: Side): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: r.x + r.width / 2, y: r.y };
    case "bottom":
      return { x: r.x + r.width / 2, y: r.y + r.height };
    case "left":
      return { x: r.x, y: r.y + r.height / 2 };
    default:
      return { x: r.x + r.width, y: r.y + r.height / 2 };
  }
}

/** The sides facing each other, for arrows drawn without a chosen side. */
export function facingSides(a: Rect, b: Rect): [Side, Side] {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ["right", "left"] : ["left", "right"];
  return dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
}

/** The side of a box nearest to a point. */
export function nearestSide(r: Rect, p: { x: number; y: number }): Side {
  const d: [Side, number][] = [
    ["top", Math.abs(p.y - r.y)],
    ["bottom", Math.abs(p.y - (r.y + r.height))],
    ["left", Math.abs(p.x - r.x)],
    ["right", Math.abs(p.x - (r.x + r.width))],
  ];
  return d.sort((a, b) => a[1] - b[1])[0][0];
}

/** SVG path of a curved arrow between two sides. */
export function edgePath(a: { x: number; y: number }, as: Side, b: { x: number; y: number }, bs: Side): string {
  const k = Math.max(40, Math.min(160, Math.hypot(b.x - a.x, b.y - a.y) / 2));
  const off = (s: Side) => (s === "top" ? [0, -k] : s === "bottom" ? [0, k] : s === "left" ? [-k, 0] : [k, 0]);
  const [ax, ay] = off(as);
  const [bx, by] = off(bs);
  return `M${a.x},${a.y} C${a.x + ax},${a.y + ay} ${b.x + bx},${b.y + by} ${b.x},${b.y}`;
}

export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function parseCanvas(src: string): CanvasDoc {
  if (!src.trim()) return { nodes: [], edges: [] };
  const raw = JSON.parse(src) as Partial<CanvasDoc>;
  return { ...raw, nodes: Array.isArray(raw.nodes) ? raw.nodes : [], edges: Array.isArray(raw.edges) ? (raw.edges as CanvasEdge[]) : [] };
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
