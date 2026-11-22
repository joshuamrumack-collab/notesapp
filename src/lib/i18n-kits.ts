// Swedish versions of the built-in notebook types. Used when a notebook is made while the interface is in Swedish,
// so card types, fields, choices, views, templates and the start page are Swedish from the start.
import type { Kit } from "./kits";

export const kitSv: Record<string, string> = {
  // General
  "General notebook": "Allmän anteckningsbok",
  "Sections and pages for anything. Comes with a simple task card and task board.": "Avsnitt och sidor för vad som helst. Med ett enkelt uppgiftskort och en uppgiftstavla.",
  Notes: "Anteckningar", "To do": "Att göra", Task: "Uppgift", Status: "Status", Doing: "Pågår", Done: "Klar", Due: "Klar senast",
  Event: "Händelse", Year: "År", When: "När", Era: "Epok", Who: "Vem", Where: "Var", "## What happened": "## Vad som hände",
  "Task board": "Uppgiftstavla", Timeline: "Tidslinje", "Meeting notes": "Mötesanteckningar", "**Date:** {{date}}": "**Datum:** {{date}}",
  "## Notes": "## Anteckningar", "## Actions": "## Att göra",
  "# Welcome to your notebook": "# Välkommen till din anteckningsbok",
  "Click anywhere on a page and type. Make sections on the left and pages in the middle column.": "Klicka var som helst på en sida och skriv. Skapa avsnitt till vänster och sidor i mittenkolumnen.",
  "- Type `[[` to link to another page": "- Skriv `[[` för att länka till en annan sida",
  "- Press **Ctrl+P** to jump to a page, **Ctrl+Shift+F** to search": "- Tryck **Ctrl+P** för att hoppa till en sida, **Ctrl+Skift+F** för att söka",
  "- Use **+ Card** above a page to add a task card": "- Använd **+ Kort** ovanför en sida för att lägga till ett uppgiftskort",
  // Dungeon Master
  "Dungeon Master": "Spelledare",
  "Campaign notebook with NPC, monster, location, quest and item cards (Pathfinder 1e style stat block), a quest board, dice roller, initiative tracker and player-safe mode.":
    "Kampanjbok med kort för SLP:er, monster, platser, uppdrag och föremål (statblock i Pathfinder 1e-stil), uppdragstavla, tärningar, initiativlista och spelarläge.",
  NPCs: "SLP:er", Players: "Spelare", Locations: "Platser", Maps: "Kartor", Sessions: "Spelmöten", Encounters: "Möten", Quests: "Uppdrag",
  Items: "Föremål", Lore: "Kunskap", History: "Historia", NPC: "SLP", Name: "Namn", Race: "Folk", Class: "Klass", Level: "Nivå", Role: "Roll",
  Location: "Plats", Attitude: "Inställning", Friendly: "Vänlig", Neutral: "Neutral", Hostile: "Fientlig", Unknown: "Okänd", Alignment: "Livsåskådning",
  HP: "KP", Parents: "Föräldrar", Partner: "Partner", Allies: "Allierade", Enemies: "Fiender", "Born (year)": "Född (år)", "Secret from players": "Hemlig för spelarna",
  "## Ability scores": "## Grundegenskaper", "| Ability | Score | Mod |": "| Egenskap | Värde | Mod |", "## Defense": "## Försvar", "## Offense": "## Anfall",
  "**Speed:** 30 ft.": "**Förflyttning:** 9 m", "**Melee:**": "**Närstrid:**", Monster: "Monster", Type: "Typ", Environment: "Miljö", Lair: "Lya",
  City: "Stad", District: "Stadsdel", Building: "Byggnad", Dungeon: "Grotta", Wilderness: "Vildmark", Plane: "Plan", Region: "Region", Ruler: "Härskare", Map: "Karta",
  "## Description": "## Beskrivning", "## People here": "## Folk här", "## Secrets": "## Hemligheter", Quest: "Uppdrag", Rumoured: "Rykte", Active: "Aktivt",
  Failed: "Misslyckat", "Given by": "Givet av", Reward: "Belöning", "Started in session": "Började på spelmöte", Item: "Föremål", Price: "Pris", Weight: "Vikt",
  Slot: "Plats på kroppen", Owner: "Ägare", Session: "Spelmöte", Date: "Datum", Chapter: "Kapitel", "NPC list": "SLP-lista", "NPCs by location": "SLP:er per plats",
  "Quest board": "Uppdragstavla", Monsters: "Monster", "Session calendar": "Spelmöteskalender", "World timeline": "Världens tidslinje", "Family tree": "Släktträd",
  "Relationship web": "Relationsnät", Human: "Människa", "Session log": "Spelmöteslogg", "## Goals for tonight": "## Mål för kvällen", "## Loot and XP": "## Byte och XP",
  "## Next time": "## Nästa gång", Encounter: "Möte", "**Where:**": "**Var:**", "**Trigger:**": "**Utlösare:**", "**Tactics:**": "**Taktik:**", "## Treasure": "## Skatt",
  "# Campaign notebook": "# Kampanjbok",
  "- Add an NPC: **New from template → NPC**, or **+ Card → NPC** on any page": "- Lägg till en SLP: **Ny från mall → SLP**, eller **+ Kort → SLP** på valfri sida",
  "- **Views** on the left list every NPC, quest and monster in the notebook": "- **Vyer** till vänster listar alla SLP:er, uppdrag och monster i boken",
  "- **Dice** and **Initiative** are under Tools": "- **Tärningar**, **Initiativ** och **Spelledarläge** finns under Verktyg",
  "- Tick **Secret from players** on a card, or the ◑ on a box, then turn on **Player-safe** before you share your screen":
    "- Kryssa i **Hemlig för spelarna** på ett kort, eller ◑ på en ruta, och slå på **Spelarläge** innan du delar skärmen",
  "> Text in a secret callout is hidden in player-safe mode.": "> Text i en hemlig ruta döljs i spelarläge.",
  // Teacher
  "Teacher planning": "Lärarplanering",
  "Work units and lessons linked to Lgr22 central content, a coverage view, a week plan and pupil notes. Works together with Lärarbordet.":
    "Arbetsområden och lektioner kopplade till centralt innehåll i Lgr22, en täckningsvy, veckoplan och elevanteckningar. Fungerar ihop med Lärarbordet.",
  Units: "Arbetsområden", Lessons: "Lektioner", Classes: "Klasser", Pupils: "Elever", Resources: "Material", "Work unit": "Arbetsområde", Course: "Kurs",
  Start: "Start", End: "Slut", Planned: "Planerad", "In progress": "Pågår", Assessed: "Bedömd", "Central content": "Centralt innehåll", "## Aim": "## Syfte",
  "## What we do": "## Vad vi gör", "## Assessment": "## Bedömning", Lesson: "Lektion", Subject: "Ämne", Moved: "Flyttad", Cancelled: "Inställd", Goal: "Mål",
  Materials: "Material", "## Start": "## Start", "## Main part": "## Huvuddel", "## Ending": "## Avslutning", "## Follow-up": "## Uppföljning",
  "Pupil note": "Elevanteckning", Pupil: "Elev", Area: "Område", Reading: "Läsning", Writing: "Skrivande", Maths: "Matematik", Social: "Socialt",
  Behaviour: "Beteende", Support: "Stöd", Other: "Övrigt", Assessment: "Bedömning", Result: "Resultat", "Work units": "Arbetsområden",
  "Lgr22 coverage": "Täckning av Lgr22", "Lgr22 in lessons": "Lgr22 i lektionerna", "Week plan": "Veckoplan", "Lessons by class": "Lektioner per klass",
  "Notes per pupil": "Anteckningar per elev", Assessments: "Bedömningar", "# Planning notebook": "# Planeringsbok",
  "- New work unit: **New from template → Work unit**, then tick its central content with **+** by *Central content*":
    "- Nytt arbetsområde: **Ny från mall → Arbetsområde**, kryssa sedan i det centrala innehållet med **+** vid *Centralt innehåll*",
  "- **Lgr22 coverage** under Views shows what the units cover and what is still missing": "- **Täckning av Lgr22** under Vyer visar vad arbetsområdena täcker och vad som saknas",
  "- New lesson: **New from template → Lesson**, and pick its work unit": "- Ny lektion: **Ny från mall → Lektion**, och välj dess arbetsområde",
  "- Already plan in Lärarbordet? **Lärarbordet…** at the bottom left brings courses in, and sends them back":
    "- Planerar du redan i Lärarbordet? **Lärarbordet…** längst ner till vänster hämtar kurser och skickar tillbaka dem",
  "- **Week plan** under Views shows lessons by week": "- **Veckoplan** under Vyer visar lektionerna vecka för vecka",
  "- Pupil notes are personal data: use **Lock** in the page header to encrypt a page with a password, and check your school's rules for where pupil notes may be stored":
    "- Elevanteckningar är personuppgifter: använd **Lås** i sidhuvudet för att kryptera en sida med lösenord, och kolla skolans regler för var elevanteckningar får sparas",
  // Game design
  "Game design": "Spelutveckling", "Design doc, mechanics, characters, levels, a task board and playtest findings.": "Designdokument, mekaniker, karaktärer, banor, uppgiftstavla och speltestfynd.",
  "Design doc": "Designdokument", Mechanics: "Mekaniker", Characters: "Karaktärer", Levels: "Banor", Tasks: "Uppgifter", Playtests: "Speltester", Idea: "Idé",
  Priority: "Prioritet", Low: "Låg", Medium: "Mellan", High: "Hög", Code: "Kod", Art: "Grafik", Audio: "Ljud", Design: "Design", UI: "Gränssnitt",
  Mechanic: "Mekanik", Prototype: "Prototyp", "In game": "I spelet", Cut: "Struken", "Design pillar": "Designpelare", "## What the player does": "## Vad spelaren gör",
  "## Why it is fun": "## Varför det är roligt", "## Open questions": "## Öppna frågor", Character: "Karaktär", Player: "Spelare", Enemy: "Fiende", Boss: "Boss",
  "Appears in": "Finns i", Blockout: "Skiss", "Art pass": "Grafikpass", Order: "Ordning", "Playtest finding": "Speltestfynd", Finding: "Fynd", Severity: "Allvar",
  Blocker: "Stoppar", Open: "Öppen", Fixed: "Fixad", "Won't fix": "Fixas inte", Build: "Bygge", "Playtest findings": "Speltestfynd", "Story timeline": "Berättelsens tidslinje",
  "Character family tree": "Karaktärernas släktträd", "Playtest session": "Speltest", "## Playtest {{date}}": "## Speltest {{date}}", "**Build:**": "**Bygge:**",
  "**Testers:**": "**Testare:**", "## What surprised us": "## Vad som överraskade oss", "## Findings": "## Fynd",
  "Add a **Playtest finding** card for each problem.": "Lägg till ett **Speltestfynd**-kort för varje problem.", "# Game design notebook": "# Spelutvecklingsbok",
  "- Write the pitch in **Design doc**": "- Skriv pitchen i **Designdokument**",
  "- Add **Task** cards anywhere; the **Task board** collects them": "- Lägg till **Uppgift**-kort var som helst; **Uppgiftstavlan** samlar dem",
  "- After a playtest, add **Playtest finding** cards": "- Lägg till **Speltestfynd**-kort efter ett speltest",
};

const word = (s: string) => kitSv[s] ?? kitSv[s.trim()] ?? s;

/** Line by line, keeping indentation; "key: Value" property lines get their value translated. */
function text(s: string): string {
  return s
    .split("\n")
    .map((line) => {
      const m = /^(\s*)(.*?)(\s*)$/.exec(line)!;
      if (kitSv[m[2]]) return m[1] + kitSv[m[2]] + m[3];
      const prop = /^([a-z][\w-]*): (.+)$/.exec(m[2]);
      if (prop && prop[1] !== "card" && kitSv[prop[2]]) return `${m[1]}${prop[1]}: ${kitSv[prop[2]]}${m[3]}`;
      return line;
    })
    .join("\n");
}
function content(s: string): string {
  if (!s.trim().startsWith("{")) return text(s);
  try {
    const doc = JSON.parse(s);
    for (const n of doc.nodes ?? []) if (typeof n.text === "string") n.text = text(n.text);
    return JSON.stringify(doc, null, "\t");
  } catch {
    return s;
  }
}

/** The kit in Swedish. Ids and field keys stay the same, so notebooks work the same whatever the language. */
export function translateKit(k: Kit): Kit {
  return {
    ...k,
    name: word(k.name),
    description: word(k.description),
    sections: k.sections.map(word),
    cardTypes: k.cardTypes.map((c) => ({
      ...c,
      name: word(c.name),
      body: c.body ? text(c.body) : c.body,
      fields: c.fields.map((f) => ({ ...f, label: word(f.label), options: f.options?.map(word) })),
    })),
    views: k.views.map((v) => ({ ...v, name: word(v.name) })),
    templates: k.templates.map((t) => ({ ...t, name: word(t.name), content: content(t.content) })),
    startPage: k.startPage ? content(k.startPage) : k.startPage,
  };
}
