// Lgr22 (and the other Swedish curricula): central content from Skolverket, the same catalogue and ids as
// Lärarbordet uses, so links made here mean the same thing there. Id of one item: "GRGRSVE01/7-9~1.1"
// = subject plan "GRGRSVE01/7-9" (Swedish, years 7-9), area 1, item 1.

export interface CatalogItem {
  id: string;
  text: string;
}
export interface CatalogArea {
  id: string;
  name: string;
  items: CatalogItem[];
}
export interface SubjectPlan {
  id: string;
  form: string;
  formName: string;
  subject: string;
  stage: string;
  areas: CatalogArea[];
}
interface RawCatalog {
  source: string;
  fetched: string;
  forms: { id: string; name: string; subjects: { id: string; name: string; plans: { id: string; name: string; areas: [string, string[]][] }[] }[] }[];
}
export interface Catalog {
  source: string;
  fetched: string;
  plans: Map<string, SubjectPlan>;
  items: Map<string, { item: CatalogItem; area: CatalogArea; plan: SubjectPlan }>;
}

export function buildCatalog(raw: RawCatalog): Catalog {
  const plans = new Map<string, SubjectPlan>();
  const items: Catalog["items"] = new Map();
  for (const f of raw.forms) {
    for (const s of f.subjects) {
      for (const p of s.plans) {
        const plan: SubjectPlan = {
          id: p.id,
          form: f.id,
          formName: f.name,
          subject: s.name,
          stage: p.name.replace(/^Alla årskurser$/, ""),
          areas: p.areas.map(([name, texts], ai) => ({
            id: `${p.id}~${ai + 1}`,
            name,
            items: texts.map((text, ii) => ({ id: `${p.id}~${ai + 1}.${ii + 1}`, text })),
          })),
        };
        plans.set(plan.id, plan);
        for (const area of plan.areas) for (const item of area.items) items.set(item.id, { item, area, plan });
      }
    }
  }
  return { source: raw.source, fetched: raw.fetched, plans, items };
}

let loading: Promise<Catalog> | null = null;

/** Loads the catalogue the first time it is needed (it is about 750 kB packed). */
export function loadCatalog(): Promise<Catalog> {
  if (!loading) {
    loading = (async () => {
      const res = await fetch("/lgr22-catalog.json.gz");
      if (!res.ok || !res.body) throw new Error("The curriculum catalogue could not be loaded.");
      const bytes = new Uint8Array(await res.arrayBuffer());
      // Served as-is (still packed) or already unpacked by the server: handle both.
      const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text() : new TextDecoder().decode(bytes);
      return buildCatalog(JSON.parse(text) as RawCatalog);
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

export const planLabel = (p: SubjectPlan) => `${p.subject}${p.stage ? " " + p.stage.replace(/^Åk /, "åk ") : ""}`;
export const planOf = (contentId: string) => contentId.split("~")[0];
/** Short form of a central content item for chips. */
export const shortText = (text: string, words = 7) => {
  const w = text.split(/\s+/);
  return w.length > words ? w.slice(0, words).join(" ") + "…" : text;
};
