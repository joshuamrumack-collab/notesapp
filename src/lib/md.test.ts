// @vitest-environment jsdom
import { expect, test } from "vitest";
import { roundTrip, splitFrontmatter } from "./md";
import { parseCanvas, serializeCanvas } from "./canvas";
import { freeName, memoryStore } from "./storage";

test("frontmatter is split off untouched", () => {
  const src = "---\ntags:\n  - a\nname: Bob\n---\n\n# Title\n";
  const { front, body } = splitFrontmatter(src);
  expect(front).toBe("---\ntags:\n  - a\nname: Bob\n---\n");
  expect(front + body).toBe(src);
  expect(splitFrontmatter("no front").front).toBe("");
});

test("Obsidian syntax survives the editor", () => {
  const out = roundTrip(
    "Link [[Wiki Link]] and [[Page|alias]] and ![[image.png]].\n\n> [!infobox]\n> **Bold**\n\n- [ ] todo\n- [x] done\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n",
  );
  expect(out).toContain("[[Wiki Link]]");
  expect(out).toContain("[[Page|alias]]");
  expect(out).toContain("![[image.png]]");
  expect(out).toContain("> [!infobox]");
  expect(out).toContain("- [ ] todo");
  expect(out).toContain("- [x] done");
  expect(out).toMatch(/\| A\s*\| B\s*\|/);
  expect(out).toMatch(/\| 1\s*\| 2\s*\|/);
});

test("canvas keeps unknown nodes, edges and fields", () => {
  const src = JSON.stringify({
    nodes: [
      { id: "1", type: "text", x: 1.4, y: 2, width: 3, height: 4, text: "hi", color: "3" },
      { id: "2", type: "group", x: 0, y: 0, width: 9, height: 9, label: "G" },
    ],
    edges: [{ id: "e", fromNode: "1", toNode: "2" }],
    extra: true,
  });
  const back = JSON.parse(serializeCanvas(parseCanvas(src)));
  expect(back.nodes[0]).toMatchObject({ color: "3", x: 1, text: "hi" });
  expect(back.nodes[1]).toMatchObject({ type: "group", label: "G" });
  expect(back.edges).toHaveLength(1);
  expect(back.extra).toBe(true);
  expect(parseCanvas("")).toEqual({ nodes: [], edges: [] });
});

test("memory store: list, move, free names", async () => {
  const s = memoryStore("t", { "A/one.md": "1", "A/B/two.canvas": "", "root.md": "r" });
  expect((await s.list("")).map((e) => e.name).sort()).toEqual(["A", "root.md"]);
  expect(await freeName(s, "A", "one", "md")).toBe("one 2.md");
  await s.move("A", "C");
  expect(await s.readText("C/B/two.canvas")).toBe("");
  expect(await s.exists("A")).toBe(false);
  await expect(s.move("root.md", "C/one.md")).rejects.toThrow();
  await s.mkdir("C/New");
  expect((await s.list("C")).map((e) => e.name).sort()).toEqual(["B", "New", "one.md"]);
});
