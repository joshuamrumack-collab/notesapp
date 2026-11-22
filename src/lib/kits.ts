// Notebook types ("kits"): starter sections, card types, views, templates and tools.
export type FieldType = "text" | "number" | "select" | "date" | "long" | "check" | "link" | "links" | "lgr22";
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  /** For "link" and "links" fields: only offer cards of this type (empty = any page). */
  target?: string;
}
export interface CardType {
  id: string;
  name: string;
  color: string;
  fields: FieldDef[];
  body?: string;
}
export type ViewKind = "table" | "board" | "schedule" | "timeline" | "tree" | "coverage" | "web";
export interface ViewDef {
  id: string;
  name: string;
  /** Card type id, or "*" for every card that has the field (timelines). */
  cardType: string;
  kind: ViewKind;
  /** board: group by; schedule: date field; timeline: when (year, date or "1247 AR"); tree: parents. */
  field?: string;
  /** timeline: era to group by; tree: partner. */
  field2?: string;
}
export interface TemplateDef {
  name: string;
  ext: "md" | "canvas";
  content: string;
}
export type ToolId = "dice" | "initiative" | "player-safe";
export interface Kit {
  format: "notesapp-kit";
  id: string;
  name: string;
  description: string;
  sections: string[];
  cardTypes: CardType[];
  views: ViewDef[];
  templates: TemplateDef[];
  tools: ToolId[];
  startPage?: string;
}

const f = (key: string, label: string, type: FieldType = "text", options?: string[]): FieldDef =>
  options ? { key, label, type, options } : { key, label, type };
/** A field that links to another page, picked from a list. */
const link = (key: string, label: string, target = ""): FieldDef => ({ key, label, type: "link", target });
/** Several links, e.g. a character's parents. */
const links = (key: string, label: string, target = ""): FieldDef => ({ key, label, type: "links", target });

/** Something that happened, for timelines. "Year" sorts it; "When" is shown as written (in-world dates are fine). */
const eventCard = (who: string, where: string): CardType => ({
  id: "event",
  name: "Event",
  color: "#5a6b8a",
  fields: [
    f("title", "Event"),
    f("year", "Year", "number"),
    f("when", "When"),
    f("era", "Era"),
    links("who", "Who", who),
    link("where", "Where", where),
  ],
  body: "## What happened\n\n",
});

/** A canvas page made of text boxes laid out top to bottom. */
function canvasOf(...boxes: [number, number, number, string][]): string {
  const nodes = boxes.map(([x, y, width, text], i) => ({ id: "t" + i, type: "text", x, y, width, height: 120, text }));
  return JSON.stringify({ nodes, edges: [] }, null, "\t") + "\n";
}

const general: Kit = {
  format: "notesapp-kit",
  id: "general",
  name: "General notebook",
  description: "Sections and pages for anything. Comes with a simple task card and task board.",
  sections: ["Notes", "To do"],
  cardTypes: [
    {
      id: "task",
      name: "Task",
      color: "#2f6fb5",
      fields: [f("title", "Task"), f("status", "Status", "select", ["To do", "Doing", "Done"]), f("due", "Due", "date")],
    },
    eventCard("", ""),
  ],
  views: [
    { id: "tasks", name: "Task board", cardType: "task", kind: "board", field: "status" },
    { id: "timeline", name: "Timeline", cardType: "event", kind: "timeline", field: "year", field2: "era" },
  ],
  templates: [{ name: "Meeting notes", ext: "md", content: "# {{title}}\n\n**Date:** {{date}}\n\n## Notes\n\n\n## Actions\n\n- [ ] \n" }],
  tools: [],
  startPage: canvasOf([40, 30, 520, "# Welcome to your notebook\n\nClick anywhere on a page and type. Make sections on the left and pages in the middle column.\n\n- Type `[[` to link to another page\n- Press **Ctrl+P** to jump to a page, **Ctrl+Shift+F** to search\n- Use **+ Card** above a page to add a task card"]),
};

const statBlock = `## Ability scores

| Ability | Score | Mod |
| --- | --- | --- |
| STR | 10 | +0 |
| DEX | 10 | +0 |
| CON | 10 | +0 |
| INT | 10 | +0 |
| WIS | 10 | +0 |
| CHA | 10 | +0 |

## Defense

**Saves:** Fort +0, Ref +0, Will +0

## Offense

**Speed:** 30 ft.
**Melee:** 

## Notes

`;

const dungeonMaster: Kit = {
  format: "notesapp-kit",
  id: "dungeon-master",
  name: "Dungeon Master",
  description: "Campaign notebook with NPC, monster, location, quest and item cards (Pathfinder 1e style stat block), a quest board, dice roller, initiative tracker and player-safe mode.",
  sections: ["NPCs", "Players", "Locations", "Maps", "Sessions", "Encounters", "Quests", "Items", "Lore", "History"],
  cardTypes: [
    {
      id: "npc",
      name: "NPC",
      color: "#8a4b2a",
      fields: [
        f("name", "Name"),
        f("race", "Race"),
        f("class", "Class"),
        f("level", "Level", "number"),
        f("role", "Role"),
        link("location", "Location", "location"),
        f("attitude", "Attitude", "select", ["Friendly", "Neutral", "Hostile", "Unknown"]),
        f("alignment", "Alignment", "select", ["LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE"]),
        f("ac", "AC", "number"),
        f("hp", "HP", "number"),
        f("initiative", "Init", "number"),
        links("parents", "Parents", "npc"),
        links("partner", "Partner", "npc"),
        links("allies", "Allies", ""),
        links("enemies", "Enemies", ""),
        f("born", "Born (year)", "number"),
        f("secret", "Secret from players", "check"),
      ],
      body: statBlock,
    },
    {
      id: "monster",
      name: "Monster",
      color: "#9b2c2c",
      fields: [
        f("name", "Name"),
        f("cr", "CR"),
        f("xp", "XP", "number"),
        f("type", "Type"),
        f("ac", "AC", "number"),
        f("hp", "HP", "number"),
        f("initiative", "Init", "number"),
        f("environment", "Environment"),
        link("lair", "Lair", "location"),
      ],
      body: statBlock,
    },
    {
      id: "location",
      name: "Location",
      color: "#3c6e47",
      fields: [f("name", "Name"), f("type", "Type", "select", ["City", "District", "Building", "Dungeon", "Wilderness", "Plane"]), f("region", "Region"), link("ruler", "Ruler", "npc"), link("map", "Map")],
      body: "## Description\n\n\n## People here\n\n\n## Secrets\n\n> [!secret]\n> \n",
    },
    {
      id: "quest",
      name: "Quest",
      color: "#6b4fa3",
      fields: [
        f("name", "Quest"),
        f("status", "Status", "select", ["Rumoured", "Active", "Done", "Failed"]),
        link("giver", "Given by", "npc"),
        link("where", "Where", "location"),
        f("reward", "Reward"),
        f("session", "Started in session"),
      ],
    },
    {
      id: "item",
      name: "Item",
      color: "#a37a1b",
      fields: [f("name", "Item"), f("type", "Type"), f("price", "Price"), f("weight", "Weight"), f("slot", "Slot"), link("owner", "Owner", "npc")],
    },
    {
      id: "session",
      name: "Session",
      color: "#2d6a8a",
      fields: [f("number", "Session", "number"), f("date", "Date", "date"), f("chapter", "Chapter")],
    },
    eventCard("npc", "location"),
  ],
  views: [
    { id: "npcs", name: "NPC list", cardType: "npc", kind: "table" },
    { id: "npcs-by-location", name: "NPCs by location", cardType: "npc", kind: "board", field: "location" },
    { id: "quest-board", name: "Quest board", cardType: "quest", kind: "board", field: "status" },
    { id: "monsters", name: "Monsters", cardType: "monster", kind: "table" },
    { id: "locations", name: "Locations", cardType: "location", kind: "table" },
    { id: "sessions", name: "Session calendar", cardType: "session", kind: "schedule", field: "date" },
    { id: "timeline", name: "World timeline", cardType: "event", kind: "timeline", field: "year", field2: "era" },
    { id: "family", name: "Family tree", cardType: "npc", kind: "tree", field: "parents", field2: "partner" },
    { id: "relations", name: "Relationship web", cardType: "npc", kind: "web", field: "allies", field2: "enemies" },
  ],
  templates: [
    { name: "NPC", ext: "md", content: "---\ncard: npc\nname: {{title}}\nrace: Human\nclass: \nlevel: 1\nattitude: Neutral\n---\n\n# {{title}}\n\n" + statBlock },
    { name: "Location", ext: "md", content: "---\ncard: location\nname: {{title}}\ntype: Building\n---\n\n# {{title}}\n\n## Description\n\n\n## People here\n\n\n## Secrets\n\n> [!secret]\n> \n" },
    {
      name: "Session log",
      ext: "canvas",
      content: canvasOf(
        [40, 30, 300, "---\ncard: session\nnumber: \ndate: {{date}}\n---\n"],
        [380, 30, 440, "## Goals for tonight\n\n- [ ] \n"],
        [40, 260, 780, "## What happened\n\n"],
        [40, 460, 380, "## Loot and XP\n\n"],
        [440, 460, 380, "## Next time\n\n"],
      ),
    },
    {
      name: "Encounter",
      ext: "canvas",
      content: canvasOf([40, 30, 420, "## {{title}}\n\n**Where:** \n**Trigger:** \n**Tactics:** "], [500, 30, 360, "## Treasure\n\n"]),
    },
  ],
  tools: ["dice", "initiative", "player-safe"],
  startPage: canvasOf(
    [40, 30, 520, "# Campaign notebook\n\n- Add an NPC: **New from template → NPC**, or **+ Card → NPC** on any page\n- **Views** on the left list every NPC, quest and monster in the notebook\n- **Dice** and **Initiative** are under Tools\n- Tick **Secret from players** on a card, or the ◑ on a box, then turn on **Player-safe** before you share your screen"],
    [600, 30, 300, "> [!secret]\n> Text in a secret callout is hidden in player-safe mode."],
  ),
};

const teacher: Kit = {
  format: "notesapp-kit",
  id: "teacher",
  name: "Teacher planning",
  description: "Work units and lessons linked to Lgr22 central content, a coverage view, a week plan and pupil notes. Works together with Lärarbordet.",
  sections: ["Units", "Lessons", "Classes", "Pupils", "Resources"],
  cardTypes: [
    {
      id: "unit",
      name: "Work unit",
      color: "#2b6cb0",
      fields: [
        f("title", "Work unit"),
        f("course", "Course"),
        f("class", "Class"),
        f("start", "Start", "date"),
        f("end", "End", "date"),
        f("status", "Status", "select", ["Planned", "In progress", "Done", "Assessed"]),
        f("content", "Central content", "lgr22"),
      ],
      body: "## Aim\n\n\n## What we do\n\n\n## Assessment\n\n",
    },
    {
      id: "lesson",
      name: "Lesson",
      color: "#1f7a6d",
      fields: [
        f("title", "Lesson"),
        f("date", "Date", "date"),
        f("class", "Class"),
        f("subject", "Subject"),
        f("status", "Status", "select", ["Planned", "Done", "Moved", "Cancelled"]),
        { key: "unit", label: "Work unit", type: "link", target: "unit" },
        f("content", "Central content", "lgr22"),
        f("goal", "Goal", "long"),
        f("materials", "Materials", "long"),
      ],
      body: "## Start\n\n\n## Main part\n\n\n## Ending\n\n\n## Follow-up\n\n",
    },
    {
      id: "pupil-note",
      name: "Pupil note",
      color: "#8a5a2b",
      fields: [
        f("pupil", "Pupil"),
        f("class", "Class"),
        f("date", "Date", "date"),
        f("area", "Area", "select", ["Reading", "Writing", "Maths", "Social", "Behaviour", "Support", "Other"]),
      ],
    },
    {
      id: "assessment",
      name: "Assessment",
      color: "#5b4a9e",
      fields: [f("pupil", "Pupil"), f("class", "Class"), f("subject", "Subject"), f("date", "Date", "date"), f("result", "Result")],
    },
  ],
  views: [
    { id: "units", name: "Work units", cardType: "unit", kind: "board", field: "status" },
    { id: "coverage", name: "Lgr22 coverage", cardType: "unit", kind: "coverage", field: "content" },
    { id: "lesson-coverage", name: "Lgr22 in lessons", cardType: "lesson", kind: "coverage", field: "content" },
    { id: "week", name: "Week plan", cardType: "lesson", kind: "schedule", field: "date" },
    { id: "by-class", name: "Lessons by class", cardType: "lesson", kind: "board", field: "class" },
    { id: "pupil-notes", name: "Notes per pupil", cardType: "pupil-note", kind: "board", field: "pupil" },
    { id: "assessments", name: "Assessments", cardType: "assessment", kind: "table" },
  ],
  templates: [
    { name: "Work unit", ext: "md", content: "---\ncard: unit\ntitle: {{title}}\ncourse: \nclass: \nstart: {{date}}\nend: \nstatus: Planned\ncontent: []\n---\n\n## Aim\n\n\n## What we do\n\n\n## Assessment\n\n" },
    { name: "Lesson", ext: "md", content: "---\ncard: lesson\ntitle: {{title}}\ndate: {{date}}\nclass: \nsubject: \nstatus: Planned\n---\n\n## Start\n\n\n## Main part\n\n\n## Ending\n\n\n## Follow-up\n\n" },
    { name: "Pupil note", ext: "md", content: "---\ncard: pupil-note\npupil: {{title}}\nclass: \ndate: {{date}}\narea: Other\n---\n\n" },
  ],
  tools: [],
  startPage: canvasOf([40, 30, 560, "# Planning notebook\n\n- New work unit: **New from template → Work unit**, then tick its central content with **+** by *Central content*\n- **Lgr22 coverage** under Views shows what the units cover and what is still missing\n- New lesson: **New from template → Lesson**, and pick its work unit\n- Already plan in Lärarbordet? **Lärarbordet…** at the bottom left brings courses in, and sends them back\n- **Week plan** under Views shows lessons by week\n- Pupil notes are personal data: use **Lock** in the page header to encrypt a page with a password, and check your school's rules for where pupil notes may be stored"]),
};

const gameDesign: Kit = {
  format: "notesapp-kit",
  id: "game-design",
  name: "Game design",
  description: "Design doc, mechanics, characters, levels, a task board and playtest findings.",
  sections: ["Design doc", "Mechanics", "Characters", "Levels", "Tasks", "Playtests"],
  cardTypes: [
    {
      id: "task",
      name: "Task",
      color: "#2f6fb5",
      fields: [
        f("title", "Task"),
        f("status", "Status", "select", ["Idea", "To do", "Doing", "Done"]),
        f("priority", "Priority", "select", ["Low", "Medium", "High"]),
        f("area", "Area", "select", ["Code", "Art", "Audio", "Design", "UI", "Other"]),
      ],
    },
    {
      id: "mechanic",
      name: "Mechanic",
      color: "#7a3fa0",
      fields: [f("name", "Mechanic"), f("status", "Status", "select", ["Idea", "Prototype", "In game", "Cut"]), f("pillar", "Design pillar")],
      body: "## What the player does\n\n\n## Why it is fun\n\n\n## Open questions\n\n",
    },
    {
      id: "character",
      name: "Character",
      color: "#a0522d",
      fields: [f("name", "Name"), f("role", "Role", "select", ["Player", "Enemy", "NPC", "Boss"]), link("level", "Appears in", "level"), links("parents", "Parents", "character"), links("partner", "Partner", "character")],
    },
    { id: "level", name: "Level", color: "#3c6e47", fields: [f("name", "Level"), f("status", "Status", "select", ["Idea", "Blockout", "Art pass", "Done"]), f("order", "Order", "number")] },
    {
      id: "finding",
      name: "Playtest finding",
      color: "#9b2c2c",
      fields: [
        f("title", "Finding"),
        f("severity", "Severity", "select", ["Low", "Medium", "High", "Blocker"]),
        f("status", "Status", "select", ["Open", "Fixed", "Won't fix"]),
        f("build", "Build"),
        f("date", "Date", "date"),
      ],
    },
    eventCard("character", "level"),
  ],
  views: [
    { id: "tasks", name: "Task board", cardType: "task", kind: "board", field: "status" },
    { id: "findings", name: "Playtest findings", cardType: "finding", kind: "board", field: "status" },
    { id: "mechanics", name: "Mechanics", cardType: "mechanic", kind: "table" },
    { id: "levels", name: "Levels", cardType: "level", kind: "board", field: "status" },
    { id: "story", name: "Story timeline", cardType: "event", kind: "timeline", field: "year", field2: "era" },
    { id: "family", name: "Character family tree", cardType: "character", kind: "tree", field: "parents", field2: "partner" },
  ],
  templates: [
    { name: "Mechanic", ext: "md", content: "---\ncard: mechanic\nname: {{title}}\nstatus: Idea\n---\n\n## What the player does\n\n\n## Why it is fun\n\n\n## Open questions\n\n" },
    { name: "Playtest session", ext: "canvas", content: canvasOf([40, 30, 420, "## Playtest {{date}}\n\n**Build:** \n**Testers:** "], [500, 30, 380, "## What surprised us\n\n"], [40, 260, 840, "## Findings\n\nAdd a **Playtest finding** card for each problem."]) },
  ],
  tools: ["dice"],
  startPage: canvasOf([40, 30, 520, "# Game design notebook\n\n- Write the pitch in **Design doc**\n- Add **Task** cards anywhere; the **Task board** collects them\n- After a playtest, add **Playtest finding** cards"]),
};

export const builtInKits: Kit[] = [general, dungeonMaster, teacher, gameDesign];

export function isKit(v: unknown): v is Kit {
  const k = v as Kit;
  return !!k && k.format === "notesapp-kit" && typeof k.name === "string" && Array.isArray(k.cardTypes) && Array.isArray(k.views);
}
