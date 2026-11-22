// Map pages (.map files): a picture with pins. A pin links to a page, or to a more detailed map.
export interface Pin {
  id: string;
  x: number; // 0..1 across the picture
  y: number; // 0..1 down the picture
  label: string;
  target?: string; // "[[Page]]"
  color?: string;
}
export interface MapDoc {
  format: "notesapp-map";
  version: 1;
  image?: string; // path in the notebook, e.g. _attachments/world.png
  pins: Pin[];
  tags?: string[];
  [key: string]: unknown;
}

export const emptyMap = (): MapDoc => ({ format: "notesapp-map", version: 1, pins: [] });

export function parseMap(src: string): MapDoc {
  if (!src.trim()) return emptyMap();
  const raw = JSON.parse(src) as Partial<MapDoc>;
  if (raw.format !== "notesapp-map") throw new Error("Not a map file");
  return { ...raw, format: "notesapp-map", version: 1, pins: Array.isArray(raw.pins) ? raw.pins : [] } as MapDoc;
}

export const serializeMap = (m: MapDoc) => JSON.stringify(m, null, "\t") + "\n";
