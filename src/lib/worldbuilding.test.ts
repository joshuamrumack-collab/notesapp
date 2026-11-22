// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { layoutTree, timeKey } from "../components/ViewPanel";
import { NotebookIndex } from "./index";
import { builtInKits } from "./kits";
import { extractTags, propertyTags } from "./links";
import { emptyMap, parseMap, serializeMap } from "./map";
import { applyKit, emptyConfig } from "./notebook";
import { memoryStore } from "./storage";

describe("tags", () => {
  test("inline and property tags", () => {
    expect(extractTags("A #city and #places/north, not #123, not a[[Page#heading]], not `#code`, (#in-brackets)")).toEqual(["city", "places/north", "in-brackets"]);
    expect(extractTags("# Heading\n#start of line")).toEqual(["start"]);
    expect(propertyTags(["#a", "b"])).toEqual(["a", "b"]);
    expect(propertyTags("a, b c")).toEqual(["a", "b", "c"]);
  });
});

describe("worldbuilding index", () => {
  const files = {
    "Maps/World.map": serializeMap({ ...emptyMap(), image: "_attachments/w.png", pins: [{ id: "1", x: 0.5, y: 0.5, label: "Town", target: "[[Town map]]" }, { id: "2", x: 0.1, y: 0.1, label: "Ruins", target: "[[Ruins]]" }] }),
    "Maps/Town map.map": serializeMap({ ...emptyMap(), pins: [{ id: "1", x: 0.5, y: 0.5, label: "Inn", target: "[[Inn]]" }] }),
    "Places/Inn.md": "---\ntags: [tavern]\n---\nCosy. #food ![[inn.png]]",
    "_attachments/w.png": "x",
    "_attachments/inn.png": "x",
    "Notes.md": "Visit [[Ruins]] and [[Ruins]] and [[Dragon]].",
  };
  test("maps, parent maps, placeholders, tags, pictures", async () => {
    const idx = await NotebookIndex.build(memoryStore("t", files));
    expect(idx.parentMaps("Maps/Town map.map")).toEqual(["Maps/World.map"]);
    expect(idx.parentMaps("Places/Inn.md")).toEqual(["Maps/Town map.map"]);
    expect(idx.unwritten()).toEqual([
      { target: "Ruins", from: ["Maps/World.map", "Notes.md"] },
      { target: "Dragon", from: ["Notes.md"] },
    ]);
    expect([...idx.tags()]).toEqual([["food", ["Places/Inn.md"]], ["tavern", ["Places/Inn.md"]]]);
    expect(idx.pages.get("Places/Inn.md")?.image).toBe("inn.png");
    expect(idx.pages.get("Maps/World.map")?.image).toBe("_attachments/w.png");
    expect(idx.search("inn")[0]?.path).toBeTruthy();
  });
  test("map files are checked", () => {
    expect(() => parseMap('{"nodes":[]}')).toThrow();
    expect(parseMap("").pins).toEqual([]);
  });
});

describe("timeline and tree", () => {
  test("time keys", () => {
    expect(timeKey(1247)).toBe(1247);
    expect(timeKey("Frostmoon 3rd, 1247 AR")).toBe(1247);
    expect(timeKey("1247 AR")).toBe(1247);
    expect(timeKey("-300 BE")).toBe(-300);
    expect(timeKey("2026-11-22")! > timeKey("2026-01-30")!).toBe(true);
    expect(timeKey("")).toBeNull();
  });
  test("family layout puts children below parents and partners side by side", () => {
    const { pos } = layoutTree([
      { id: "gran", parents: [], partners: ["gramps"] },
      { id: "gramps", parents: [], partners: [] },
      { id: "mum", parents: ["gran", "gramps"], partners: ["dad"] },
      { id: "dad", parents: [], partners: [] },
      { id: "kid", parents: ["mum", "dad"], partners: [] },
    ]);
    const y = (id: string) => pos.get(id)!.y;
    expect(y("gran")).toBe(y("gramps"));
    expect(y("mum")).toBeGreaterThan(y("gran"));
    expect(y("dad")).toBe(y("mum"));
    expect(y("kid")).toBeGreaterThan(y("mum"));
    expect(Math.abs(pos.get("mum")!.x - pos.get("dad")!.x)).toBeLessThan(200);
  });
  test("re-applying a kit adds new fields to an existing card type", async () => {
    const store = memoryStore("t");
    const dm = builtInKits.find((k) => k.id === "dungeon-master")!;
    const old = { ...emptyConfig(), cardTypes: [{ id: "npc", name: "My NPC", color: "#000", fields: [{ key: "name", label: "Name", type: "text" as const }] }] };
    const c = await applyKit(store, dm, old, { sections: false, startPage: false });
    const npc = c.cardTypes.find((t) => t.id === "npc")!;
    expect(npc.name).toBe("My NPC");
    expect(npc.fields.map((f) => f.key)).toContain("parents");
    expect(c.views.some((v) => v.kind === "tree")).toBe(true);
  });
});
