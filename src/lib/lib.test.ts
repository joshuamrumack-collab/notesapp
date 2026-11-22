// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { serializeCanvas, parseCanvas } from "./canvas";
import { coerce, newCardText, updateCardField } from "./cards";
import { roll } from "./dice";
import { frontData, setFrontField, splitFrontmatter } from "./frontmatter";
import { NotebookIndex } from "./index";
import { builtInKits } from "./kits";
import { extractLinks, replaceLinks } from "./links";
import { applyKit, emptyConfig, exportKit, fillTemplate, loadConfig } from "./notebook";
import { convertPage, htmlToMarkdown, parseHierarchy, countPages } from "./onenote";
import { orderPages } from "./order";
import { memoryStore } from "./storage";

const canvasWith = (...texts: string[]) =>
  serializeCanvas({ nodes: texts.map((text, i) => ({ id: "n" + i, type: "text", x: 0, y: i * 100, width: 300, height: 80, text })), edges: [] });

describe("links", () => {
  test("extract and replace", () => {
    expect(extractLinks("a [[One]] b [[Two|alias]] [[Three#h]] ![[img.png]]")).toEqual(["One", "Two", "Three"]);
    const r = replaceLinks("[[Old]] [[old|x]] [[F/Old#h]] [[Other]] ![[Old]]", "Old", "New");
    expect(r.text).toBe("[[New]] [[New|x]] [[F/New#h]] [[Other]] ![[Old]]");
    expect(r.count).toBe(3);
  });
});

describe("frontmatter", () => {
  test("set keeps other lines and comments", () => {
    const front = "---\n# comment\nname: Bob\ntags:\n  - a\n---\n";
    const out = setFrontField(front, "hp", 12);
    expect(out).toContain("# comment");
    expect(out).toContain("  - a");
    expect(frontData(out)).toMatchObject({ name: "Bob", hp: 12, tags: ["a"] });
    expect(frontData(setFrontField(out, "hp", undefined))).not.toHaveProperty("hp");
    expect(frontData(setFrontField("", "a", "x"))).toEqual({ a: "x" });
    expect(() => setFrontField("---\na: [\n---\n", "b", 1)).toThrow();
  });
  test("dates stay strings", () => {
    expect(frontData("---\ndate: 2026-11-22\n---\n").date).toBe("2026-11-22");
  });
});

describe("index", () => {
  const files = {
    "NPCs/Bob.md": "---\ncard: npc\nname: Bob\nlocation: Town\n---\nLives near [[Mill]] and [[Town|the town]].",
    "Places/Mill.canvas": canvasWith("# The mill\nOwned by [[Bob]]", "---\ncard: npc\nname: Miller Ann\n---\nGrumpy"),
    "Places/Town.md": "A town. ![[map.png]]",
    "_templates/NPC.md": "---\ncard: npc\nname: {{title}}\n---\n",
    "Images/map.png": "x",
    "Other/Mill.md": "a second Mill",
  };
  test("build, resolve, backlinks, cards, search", async () => {
    const idx = await NotebookIndex.build(memoryStore("t", files));
    expect(idx.resolve("Mill", "Places/Town.md")).toBe("Places/Mill.canvas");
    expect(idx.resolve("Other/Mill")).toBe("Other/Mill.md");
    expect(idx.resolve("Nobody")).toBeNull();
    expect(idx.resolveFile("map.png", "Places/Town.md")).toBe("Images/map.png");
    expect(idx.backlinks("NPCs/Bob.md")).toEqual(["Places/Mill.canvas"]);
    expect(idx.backlinks("Places/Town.md")).toEqual(["NPCs/Bob.md"]);
    const npcs = idx.allCards().filter((c) => c.type === "npc").map((c) => c.title).sort();
    expect(npcs).toEqual(["Bob", "Miller Ann"]);
    expect(idx.search("grumpy")[0].path).toBe("Places/Mill.canvas");
    expect(idx.findTitles("mil").map((p) => p.title)).toEqual(["Mill", "Mill"]);
    idx.setPage("NPCs/Bob.md", "no links now");
    expect(idx.backlinks("Places/Town.md")).toEqual([]);
  });
});

describe("cards", () => {
  test("update a field in a canvas card and in a page", async () => {
    const store = memoryStore("t", {
      "a.canvas": canvasWith("---\ncard: quest\nstatus: Active\n---\nBody"),
      "b.md": "---\ncard: quest\nstatus: Active\n---\n# B\n",
    });
    await updateCardField(store, { path: "a.canvas", nodeId: "n0" }, "status", "Done");
    expect(parseCanvas(await store.readText("a.canvas")).nodes[0].text).toBe("---\ncard: quest\nstatus: Done\n---\nBody");
    await updateCardField(store, { path: "b.md" }, "status", "Failed");
    expect(await store.readText("b.md")).toBe("---\ncard: quest\nstatus: Failed\n---\n# B\n");
  });
  test("new card text and coercion", () => {
    const npc = builtInKits[1].cardTypes[0];
    const text = newCardText(npc, { name: "Ann" });
    const { front, body } = splitFrontmatter(text);
    expect(frontData(front)).toMatchObject({ card: "npc", name: "Ann", secret: false });
    expect(body).toContain("Ability scores");
    expect(coerce({ key: "a", label: "A", type: "number" }, "12")).toBe(12);
    expect(coerce({ key: "a", label: "A", type: "number" }, "")).toBe("");
  });
});

describe("dice", () => {
  const seq = (...v: number[]) => {
    let i = 0;
    return () => v[i++ % v.length];
  };
  test("rolls", () => {
    expect(roll("2d6+3", seq(0, 0.99)).total).toBe(1 + 6 + 3);
    expect(roll("d20", seq(0.5)).total).toBe(11);
    expect(roll("4d6kh3", seq(0, 0.5, 0.99, 0.99)).total).toBe(4 + 6 + 6);
    expect(roll("2d20kl1 - 1", seq(0.99, 0)).total).toBe(0);
    expect(roll("d%", seq(0.999)).total).toBe(100);
    expect(() => roll("2x6")).toThrow();
    expect(() => roll("")).toThrow();
    expect(() => roll("2d6 3")).toThrow();
  });
});

describe("kits and templates", () => {
  test("apply, template fill, export", async () => {
    const store = memoryStore("t", { "NPCs/old.md": "keep" });
    const dm = builtInKits.find((k) => k.id === "dungeon-master")!;
    const config = await applyKit(store, dm, emptyConfig(), { sections: true, startPage: true });
    expect(config.cardTypes.map((c) => c.id)).toContain("npc");
    expect(await store.readText("NPCs/old.md")).toBe("keep");
    expect(await store.exists("Sessions")).toBe(true);
    expect(await store.exists("_templates/NPC.md")).toBe(true);
    expect((await loadConfig(store)).exists).toBe(true);
    expect(fillTemplate("# {{title}} {{date}} {{ time }}", "X", new Date(2026, 10, 22, 9, 5))).toBe("# X 2026-11-22 09:05");
    const { path, kit } = await exportKit(store, config, "My DM kit", "mine");
    expect(path).toBe("My DM kit.kit.json");
    expect(kit.templates.length).toBe(dm.templates.length);
    expect(kit.sections).toContain("NPCs");
  });
  test("obsidian templates folder is used", async () => {
    const store = memoryStore("t", { ".obsidian/templates.json": '{"folder":"z-templates"}' });
    expect((await loadConfig(store)).config.templatesFolder).toBe("z-templates");
  });
  test("every built-in template is valid", () => {
    for (const kit of builtInKits) {
      for (const t of kit.templates) if (t.ext === "canvas") expect(() => parseCanvas(t.content)).not.toThrow();
      for (const v of kit.views) expect(kit.cardTypes.some((c) => c.id === v.cardType)).toBe(true);
      if (kit.startPage) expect(parseCanvas(kit.startPage).nodes.length).toBeGreaterThan(0);
    }
  });
});

describe("order", () => {
  test("saved order first, rest alphabetical", () => {
    const e = (name: string) => ({ name, isDir: false });
    const out = orderPages([e("b.md"), e("a.md"), e("c.md")], [{ name: "c.md", level: 1 }, { name: "gone.md" }]);
    expect(out.map((o) => `${o.entry.name}:${o.level}`)).toEqual(["c.md:1", "a.md:0", "b.md:0"]);
  });
});

describe("onenote", () => {
  const hier = `<?xml version="1.0"?>
<one:Notebooks xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
  <one:Notebook name="Campaign" nickname="Campaign" ID="nb1">
    <one:Section name="NPCs" ID="s1">
      <one:Page ID="p1" name="Bob" pageLevel="1"/>
      <one:Page ID="p2" name="Bob's dog" pageLevel="2"/>
      <one:Page ID="p3" name="Old" pageLevel="1" isInRecycleBin="true"/>
    </one:Section>
    <one:SectionGroup name="Archive" ID="g1"><one:Section name="2025" ID="s2" locked="true"/></one:SectionGroup>
    <one:SectionGroup name="OneNote_RecycleBin" ID="rb" isRecycleBin="true"><one:Section name="Deleted" ID="s3"/></one:SectionGroup>
  </one:Notebook>
</one:Notebooks>`;
  test("hierarchy", () => {
    const [nb] = parseHierarchy(hier);
    expect(nb.name).toBe("Campaign");
    expect(nb.children.map((c) => c.name)).toEqual(["NPCs", "Archive"]);
    const npcs = nb.children[0];
    expect(npcs.kind === "section" && npcs.pages.map((p) => `${p.name}:${p.level}`)).toEqual(["Bob:1", "Bob's dog:2"]);
    const arch = nb.children[1];
    expect(arch.kind === "group" && arch.children[0].kind === "section" && arch.children[0].locked).toBe(true);
    expect(countPages(nb.children)).toBe(2);
  });
  test("page content", () => {
    const png = btoa("PNGDATA");
    const page = `<?xml version="1.0"?>
<one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote" ID="p1" name="Bob">
  <one:TagDef index="0" type="0" symbol="3" name="To Do"/>
  <one:QuickStyleDef index="0" name="PageTitle"/>
  <one:QuickStyleDef index="1" name="p"/>
  <one:QuickStyleDef index="2" name="h1"/>
  <one:Title><one:OE quickStyleIndex="0"><one:T><![CDATA[Bob the <span style='font-weight:bold'>Smith</span>]]></one:T></one:OE></one:Title>
  <one:Outline>
    <one:Position x="36.0" y="86.4" z="0"/><one:Size width="300.0" height="100.0"/>
    <one:OEChildren>
      <one:OE quickStyleIndex="2"><one:T><![CDATA[Stats]]></one:T></one:OE>
      <one:OE quickStyleIndex="1"><one:T><![CDATA[Very <span style='font-style:italic'>gruff</span>, see <a href="onenote:#Mill&amp;section-id=x">Mill</a><br>and <a href="https://x.org">site</a>]]></one:T></one:OE>
      <one:OE><one:List><one:Bullet bullet="2"/></one:List><one:T><![CDATA[one]]></one:T>
        <one:OEChildren><one:OE><one:List><one:Number numberSequence="0" text="1."/></one:List><one:T><![CDATA[sub]]></one:T></one:OE></one:OEChildren>
      </one:OE>
      <one:OE><one:Tag index="0" completed="true"/><one:T><![CDATA[done thing]]></one:T></one:OE>
      <one:OE><one:Tag index="0" completed="false"/><one:T><![CDATA[open thing]]></one:T></one:OE>
      <one:OE><one:Table><one:Row><one:Cell><one:OEChildren><one:OE><one:T><![CDATA[STR]]></one:T></one:OE></one:OEChildren></one:Cell><one:Cell><one:OEChildren><one:OE><one:T><![CDATA[16]]></one:T></one:OE></one:OEChildren></one:Cell></one:Row>
        <one:Row><one:Cell><one:OEChildren><one:OE><one:T><![CDATA[DEX]]></one:T></one:OE></one:OEChildren></one:Cell><one:Cell><one:OEChildren><one:OE><one:T><![CDATA[a|b]]></one:T></one:OE></one:OEChildren></one:Cell></one:Row></one:Table></one:OE>
      <one:OE><one:Image format="png"><one:Size width="10" height="10"/><one:Data>${png}</one:Data></one:Image></one:OE>
    </one:OEChildren>
  </one:Outline>
  <one:Image format="jpg"><one:Position x="400" y="100"/><one:Size width="150" height="75"/><one:Data>${png}</one:Data></one:Image>
  <one:InkDrawing><one:Position x="0" y="0"/></one:InkDrawing>
  <one:InsertedFile preferredName="sheet.pdf"><one:Position x="0" y="0"/></one:InsertedFile>
</one:Page>`;
    const out = convertPage(page);
    expect(out.title).toBe("Bob the **Smith**");
    expect(out.nodes).toHaveLength(2);
    const text = out.nodes[0].text!;
    expect(text).toContain("# Stats");
    expect(text).toContain("Very *gruff*, see [[Mill]]\nand [site](https://x.org)");
    expect(text).toContain("- one\n    1. sub");
    expect(text).toContain("- [x] done thing\n- [ ] open thing");
    expect(text).toContain("| STR | 16 |\n| --- | --- |\n| DEX | a\\|b |");
    expect(text).toContain("![[@@ATT0@@]]");
    expect(out.nodes[0]).toMatchObject({ x: 48, y: 45, width: 400 });
    expect(out.nodes[1]).toMatchObject({ type: "file", file: "@@ATT1@@", x: 533, width: 200 });
    expect(out.attachments.map((a) => a.ext)).toEqual(["png", "jpg"]);
    expect(new TextDecoder().decode(out.attachments[0].data)).toBe("PNGDATA");
    expect(out.skipped).toEqual(["drawing or handwriting", 'attached file "sheet.pdf"']);
  });
  test("html escapes markdown characters", () => {
    expect(htmlToMarkdown("a*b [x]")).toBe("a\\*b \\[x\\]");
  });
});

describe("onenote import", () => {
  test("writes folders, pages, attachments, order and report", async () => {
    const { importNotebook } = await import("./onenote-import");
    const { loadOrder } = await import("./order");
    const hier = `<one:Notebooks xmlns:one="x"><one:Notebook name="Camp" ID="nb"><one:Section name="NPCs" ID="s1"><one:Page ID="p1" name="Bob" pageLevel="1"/><one:Page ID="p2" name="Bob: dog?" pageLevel="2"/><one:Page ID="bad" name="Broken" pageLevel="1"/></one:Section><one:SectionGroup name="Old" ID="g"><one:Section name="Locked" ID="s2" locked="true"/></one:SectionGroup></one:Notebook></one:Notebooks>`;
    const page = (title: string) =>
      `<one:Page xmlns:one="x" name="${title}"><one:Outline><one:Position x="0" y="100"/><one:Size width="300" height="50"/><one:OEChildren><one:OE><one:T><![CDATA[Hello ${title}]]></one:T></one:OE><one:OE><one:Image format="png"><one:Data>${btoa("IMG")}</one:Data></one:Image></one:OE></one:OEChildren></one:Outline><one:Image format="png"><one:Position x="400" y="0"/><one:Size width="75" height="75"/><one:Data>${btoa("IMG2")}</one:Data></one:Image><one:InkDrawing/></one:Page>`;
    const src = {
      hierarchy: async () => hier,
      page: async (id: string) => {
        if (id === "bad") throw new Error("OneNote did not answer.");
        return page(id === "p1" ? "Bob" : "Dog");
      },
    };
    const [nb] = parseHierarchy(hier);
    const store = memoryStore("t", { "Camp/existing.md": "x" });
    const r = await importNotebook(store, src, nb, new Set(["s1", "s2"]), () => {});
    expect(r.folder).toBe("Camp 2");
    expect(r.pages).toBe(2);
    const files = (await store.list("Camp 2/NPCs")).map((e) => e.name).sort();
    expect(files).toEqual(["Bob dog.canvas", "Bob.canvas"]);
    const doc = parseCanvas(await store.readText("Camp 2/NPCs/Bob.canvas"));
    expect(doc.nodes[0].text).toBe("Hello Bob\n\n![[Bob.png]]");
    expect(doc.nodes[1].file).toBe("_attachments/Bob 2.png");
    expect(new TextDecoder().decode(await store.readBytes("_attachments/Bob.png"))).toBe("IMG");
    expect((await loadOrder(store))["Camp 2/NPCs"]).toEqual([{ name: "Bob.canvas" }, { name: "Bob dog.canvas", level: 1 }]);
    expect(r.report).toContain("Imported **2** of 3 pages");
    expect(r.report).toContain("Broken");
    expect(r.report).toContain("password protected");
    expect(r.report).toContain("drawing or handwriting");
    expect(await store.exists("Camp 2/Import report.md")).toBe(true);
  });
});

describe("property links", async () => {
  const { propertyLinks, linkLabel, singleLink } = await import("./links");
  test("helpers", () => {
    expect(propertyLinks({ card: "npc", location: "[[Town]]", friends: ["[[A]]", "[[B|Bee]]"], plain: "x", bare: [["Unquoted"]] })).toEqual(["Town", "A", "B", "Unquoted"]);
    expect(linkLabel("[[Places/Town|the town]] and [[Places/Mill]]")).toBe("the town and Mill");
    expect(singleLink(" [[Town#h]] ")).toBe("Town");
    expect(singleLink("[[A]] [[B]]")).toBeNull();
  });
  test("a card field link counts as a backlink, and linkTo handles duplicate names", async () => {
    const idx = await NotebookIndex.build(
      memoryStore("t", {
        "NPCs/Bob.md": '---\ncard: npc\nlocation: "[[Town]]"\n---\nNo links in the text.',
        "Places/Town.md": "x",
        "A/Same.md": "1",
        "B/Same.md": "2",
      }),
    );
    expect(idx.backlinks("Places/Town.md")).toEqual(["NPCs/Bob.md"]);
    expect(idx.linkTo("Places/Town.md")).toBe("Town");
    expect(idx.linkTo("B/Same.md")).toBe("B/Same");
  });
  test("a link value is quoted in YAML", () => {
    const out = setFrontField("---\ncard: npc\n---\n", "location", "[[Town]]");
    expect(out).toContain('location: "[[Town]]"');
    expect(frontData(out).location).toBe("[[Town]]");
  });
});
