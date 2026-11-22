import { serializeCanvas } from "./canvas";
import { builtInKits } from "./kits";
import { applyKit, emptyConfig } from "./notebook";
import { type Store, memoryStore } from "./storage";

const canvas = (...boxes: [number, number, number, string][]) =>
  serializeCanvas({ nodes: boxes.map(([x, y, width, text], i) => ({ id: "d" + i, type: "text", x, y, width, height: 100, text })), edges: [] });

const regionMap = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<rect width="1200" height="800" fill="#e8dcc0"/>
<path d="M0 560 C200 520 320 640 520 600 S900 520 1200 580 V800 H0Z" fill="#9cc3d5"/>
<path d="M140 120 l60 -70 l60 70 z M230 140 l50 -60 l50 60 z M300 110 l45 -55 l45 55z" fill="#9a8b73"/>
<circle cx="760" cy="300" r="120" fill="#b9c99a" opacity=".7"/>
<path d="M500 380 C560 330 650 330 700 300" stroke="#a37a1b" stroke-width="6" fill="none" stroke-dasharray="14 8"/>
<text x="40" y="60" font-family="Georgia" font-size="40" fill="#5b4a2f">The Mana Wastes</text>
</svg>`;

const files: Record<string, string> = {
  "_attachments/mana-wastes.svg": regionMap,
  "Maps/Region map.map": JSON.stringify({ format: "notesapp-map", version: 1, image: "_attachments/mana-wastes.svg", pins: [
    { id: "p1", x: 0.42, y: 0.49, label: "Copperhold", target: "[[Copperhold]]", color: "#c0392b" },
    { id: "p2", x: 0.63, y: 0.36, label: "The Old Mill", target: "[[The Old Mill]]", color: "#a37a1b" },
    { id: "p3", x: 0.2, y: 0.12, label: "Iron Peaks", target: "[[Iron Peaks]]", color: "#333333" },
  ] }, null, "\t"),
  "NPCs/Hilda Ironhand.md": "---\ncard: npc\nname: Hilda Ironhand\nrace: Dwarf\nclass: Fighter\nlevel: 9\nrole: Retired captain\nlocation: \"[[Copperhold]]\"\nattitude: Neutral\nborn: 1180\nparents: []\npartner: []\n---\n\n# Hilda Ironhand\n\nMother of [[Brannok the Smith]] and [[The Gentleman]]. Fought in the war of #iron-peaks.\n",
  "History/Founding of Copperhold.md": "---\ncard: event\ntitle: Founding of Copperhold\nyear: 812\nwhen: 812 AR\nera: Age of Steam\nwho: []\nwhere: \"[[Copperhold]]\"\n---\n\nGunsmiths settle by the river.\n",
  "History/The Great Fire.md": "---\ncard: event\ntitle: The Great Fire\nyear: 1190\nwhen: Summer 1190 AR\nera: Age of Steam\nwho:\n  - \"[[Hilda Ironhand]]\"\nwhere: \"[[Copperhold]]\"\n---\n\nHalf the city burns. #disaster\n",
  "History/The party arrives.md": "---\ncard: event\ntitle: The party arrives\nyear: 1247\nwhen: Frostmoon 3rd, 1247 AR\nera: Age of Ash\nwho: []\nwhere: \"[[Copperhold]]\"\n---\n\nSee [[Session 01]].\n",
  "NPCs/Brannok the Smith.md":
    "---\ncard: npc\nname: Brannok the Smith\nrace: Dwarf\nclass: Expert\nlevel: 3\nrole: Blacksmith\nlocation: \"[[Copperhold]]\"\nparents:\n  - \"[[Hilda Ironhand]]\"\ntags: [smith, copperhold]\nattitude: Friendly\nalignment: LN\nac: 12\nhp: 22\ninitiative: 1\nsecret: false\n---\n\n# Brannok the Smith\n\nGruff but fair. Owes money to [[The Gentleman]]. Works out of [[Copperhold]].\n\n| Ability | Score |\n| --- | --- |\n| STR | 16 |\n| CHA | 8 |\n",
  "NPCs/The Gentleman.md":
    "---\ncard: npc\nname: The Gentleman\nrace: Human\nclass: Rogue\nlevel: 7\nrole: Crime boss\nlocation: \"[[Copperhold]]\"\nparents:\n  - \"[[Hilda Ironhand]]\"\ntags: [villain]\nattitude: Hostile\nalignment: NE\nac: 18\nhp: 45\ninitiative: 4\nsecret: true\n---\n\n# The Gentleman\n\nRuns the black market.\n\n> [!secret]\n> He is Brannok's brother.\n",
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
