// @vitest-environment jsdom
import { expect, test } from "vitest";
import { roundTrip } from "./md";
import { preserveMarkdown, splitBlocks } from "./mdPreserve";

// The user's real NPC template: Templater code, Obsidian callouts, a table, odd spacing.
const vault = `<%*
const name = await tp.system.prompt("NPC name");
await tp.file.rename(name);
_%>
# <% tp.file.title %>
> [!infobox]
> # <% tp.file.title %>
> ![[placeholder.png]]
> ###### Stats
> | Type | Stat |
> | --- | --- |
> | AC | \`0\` |

*  Uses star bullets
*  and two spaces

Some text with __underscore bold__ and a trailing  
hard break.

| A |B|
|---|-|
|1|2|
`;

test("an untouched note comes back exactly as it was", () => {
  expect(preserveMarkdown(vault, roundTrip(vault))).toBe(vault);
});

test("only the edited block changes", () => {
  const edited = roundTrip(vault).replace("hard break.", "hard break, edited.");
  const out = preserveMarkdown(vault, edited);
  expect(out).toContain("<%*\nconst name = await tp.system.prompt(\"NPC name\");");
  expect(out).toContain("*  Uses star bullets\n*  and two spaces");
  expect(out).toContain("|1|2|");
  expect(out).toContain("edited.");
  expect(out).not.toContain("\\<%");
});

test("adding and deleting blocks keeps the others", () => {
  const md = "# Title\n\nFirst __para__.\n\n*  item\n\nLast para.\n";
  const rt = roundTrip(md);
  const withNew = rt.replace("Last para.", "Inserted.\n\nLast para.");
  expect(preserveMarkdown(md, withNew)).toBe("# Title\n\nFirst __para__.\n\n*  item\n\nInserted.\n\nLast para.\n");
  const withoutFirst = rt.replace(/First [^\n]*\n\n/, "");
  expect(preserveMarkdown(md, withoutFirst)).toBe("# Title\n\n*  item\n\nLast para.\n");
});

test("blocks", () => {
  expect(splitBlocks("a\n\n\nb\n").map((b) => b.raw)).toEqual(["a", "b"]);
});
