import { serializeCanvas } from "./canvas";
import { builtInKits } from "./kits";
import { applyKit, emptyConfig } from "./notebook";
import { type Store, memoryStore } from "./storage";

const canvas = (...boxes: [number, number, number, string][]) =>
  serializeCanvas({ nodes: boxes.map(([x, y, width, text], i) => ({ id: "d" + i, type: "text", x, y, width, height: 100, text })), edges: [] });

const files: Record<string, string> = {
  "NPCs/Brannok the Smith.md":
    "---\ncard: npc\nname: Brannok the Smith\nrace: Dwarf\nclass: Expert\nlevel: 3\nrole: Blacksmith\nlocation: \"[[Copperhold]]\"\nattitude: Friendly\nalignment: LN\nac: 12\nhp: 22\ninitiative: 1\nsecret: false\n---\n\n# Brannok the Smith\n\nGruff but fair. Owes money to [[The Gentleman]]. Works out of [[Copperhold]].\n\n| Ability | Score |\n| --- | --- |\n| STR | 16 |\n| CHA | 8 |\n",
  "NPCs/The Gentleman.md":
    "---\ncard: npc\nname: The Gentleman\nrace: Human\nclass: Rogue\nlevel: 7\nrole: Crime boss\nlocation: \"[[Copperhold]]\"\nattitude: Hostile\nalignment: NE\nac: 18\nhp: 45\ninitiative: 4\nsecret: true\n---\n\n# The Gentleman\n\nRuns the black market.\n\n> [!secret]\n> He is Brannok's brother.\n",
  "Locations/Copperhold.canvas": canvas(
    [40, 30, 420, "---\ncard: location\nname: Copperhold\ntype: City\nregion: The Mana Wastes\nruler: Grand Duke\n---\n\nA smoky city of gunsmiths."],
    [500, 30, 320, "## Who is here\n\n- [[Brannok the Smith]]\n- [[The Gentleman]]"],
  ),
  "Quests/Missing shipment.canvas": canvas([40, 30, 420, "---\ncard: quest\nname: The missing shipment\nstatus: Active\ngiver: \"[[Brannok the Smith]]\"\nreward: 200 gp\n---\n\nA crate of rifles never arrived."]),
  "Quests/Rats in the cellar.md": "---\ncard: quest\nname: Rats in the cellar\nstatus: Done\ngiver: Innkeeper\nreward: 10 gp\n---\n\nDone in session 1.\n",
  "Sessions/Session 01.canvas": canvas(
    [40, 30, 300, "---\ncard: session\nnumber: 1\ndate: 2026-11-20\n---\n"],
    [380, 30, 420, "## What happened\n\nThe party met [[Brannok the Smith]] and took on [[Missing shipment]]."],
  ),
};

export async function makeDemo(): Promise<Store> {
  const store = memoryStore("Demo campaign", files);
  await applyKit(store, builtInKits.find((k) => k.id === "dungeon-master")!, emptyConfig(), { sections: true, startPage: true });
  return store;
}
