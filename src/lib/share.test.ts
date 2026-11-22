import { expect, test } from "vitest";
import { memoryStore } from "./storage";
import { NotebookIndex } from "./index";
import { buildShareHtml, stripSecrets } from "./share";

test("stripSecrets drops secret callouts only", () => {
  expect(stripSecrets("a\n> [!secret]\n> hidden\n> more\nb\n> quote")).toBe("a\nb\n> quote");
});

test("player export leaves secrets out of the file", async () => {
  const canvas = JSON.stringify({
    nodes: [
      { id: "a", type: "text", x: 0, y: 0, width: 300, height: 100, text: "Visible box with [[Town]]" },
      { id: "b", type: "text", x: 0, y: 200, width: 300, height: 100, text: "BOXSECRET", secret: true },
      { id: "c", type: "text", x: 400, y: 0, width: 300, height: 100, text: "---\ncard: npc\nname: Bob\nsecret: true\n---\nCARDSECRET" },
    ],
    edges: [],
  });
  const store = memoryStore("Camp", {
    "Lore/Start.canvas": canvas,
    "Lore/Town.md": "# Town\n\nNice place.\n\n> [!secret]\n> CALLOUTSECRET\n\nLinks to [[Villain]].",
    "Lore/Villain.md": "---\nsecret: true\n---\nPAGESECRET",
    "_templates/NPC.md": "TEMPLATE",
  });
  const index = await NotebookIndex.build(store, "_templates");
  const { html, pages, left } = await buildShareHtml(store, index, { title: "Camp", folder: "", templatesFolder: "_templates", cardTypes: [] });
  expect(pages).toBe(2);
  expect(left).toBe(1);
  for (const s of ["BOXSECRET", "CARDSECRET", "CALLOUTSECRET", "PAGESECRET", "TEMPLATE"]) expect(html).not.toContain(s);
  expect(html).toContain("Visible box");
  expect(html).toMatch(/<a href="#p\d">Town<\/a>/);
  expect(html).toContain('<span class="nolink">Villain</span>');
});

test("player export handles formatting from the format bar", async () => {
  const store = memoryStore("C", { "A/P.md": 'a <u>u</u> ==hl== <span style="color: #c53030">red</span>\n\n<p style="text-align: center">mid</p>' });
  const index = await NotebookIndex.build(store, "_templates");
  const { html } = await buildShareHtml(store, index, { title: "C", folder: "", templatesFolder: "_templates", cardTypes: [] });
  expect(html).toContain("<mark>hl</mark>");
  expect(html).toContain("<u>u</u>");
});
