// Page order and subpage levels per section, kept in .notesapp/order.json (OneNote-style ordering).
import type { Entry, Store } from "./storage";

export interface OrderItem {
  name: string;
  level?: number;
}
export type OrderMap = Record<string, OrderItem[]>;

const PATH = ".notesapp/order.json";

export async function loadOrder(store: Store): Promise<OrderMap> {
  try {
    return JSON.parse(await store.readText(PATH)) as OrderMap;
  } catch {
    return {};
  }
}

export async function saveOrder(store: Store, order: OrderMap) {
  await store.writeText(PATH, JSON.stringify(order, null, "\t") + "\n");
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Pages in saved order first, then the rest alphabetically. */
export function orderPages(pages: Entry[], items: OrderItem[] = []): { entry: Entry; level: number }[] {
  const byKey = new Map(pages.map((p) => [p.name, p]));
  const out: { entry: Entry; level: number }[] = [];
  for (const it of items) {
    const e = byKey.get(it.name);
    if (e) {
      out.push({ entry: e, level: it.level ?? 0 });
      byKey.delete(it.name);
    }
  }
  for (const e of [...byKey.values()].sort((a, b) => byName(a.name, b.name))) out.push({ entry: e, level: 0 });
  return out;
}

export function renameInOrder(order: OrderMap, section: string, from: string, to: string): OrderMap {
  const list = order[section];
  if (!list) return order;
  return { ...order, [section]: list.map((it) => (it.name === from ? { ...it, name: to } : it)) };
}
