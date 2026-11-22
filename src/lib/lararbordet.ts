// Bridge to Lärarbordet (DorkTeach's planning app): read its shared course files and its data file, and write
// shared course files back. Only courses, work units (arbetsområden) and lessons are read: pupils, groups,
// grades and assessment notes are never read or copied.

export interface LbUnit {
  id: string;
  title: string;
  start: string;
  end: string;
  desc: string;
  contentIds: string[];
  status?: string;
}
export interface LbLesson {
  unitId: string;
  date: string;
  title: string;
  plan: string;
}
export interface LbCourse {
  name: string;
  subjectId: string;
  color?: string;
  units: LbUnit[];
  lessons: LbLesson[];
}
export interface LbPackage {
  type: "lararbordet-kurs";
  v: 1;
  exported: string;
  yearStart: string;
  course: { name: string; subjectId: string; color?: string };
  units: Omit<LbUnit, "status">[];
  lessons: LbLesson[];
  assessments: unknown[];
  extra: unknown[];
  custom: null;
}

interface Envelope {
  format: "lararbordet-krypterad";
  iter: number;
  salt: string;
  iv: string;
  data: string;
}

export const isEncrypted = (o: unknown): o is Envelope => !!o && (o as Envelope).format === "lararbordet-krypterad";

const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Opens a password-protected Lärarbordet file. Throws "Wrong password" when it does not open. */
export async function decryptLararbordet(env: Envelope, password: string): Promise<unknown> {
  const c = globalThis.crypto.subtle;
  const base = await c.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await c.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64(env.salt) as BufferSource, iterations: env.iter }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  try {
    const plain = await c.decrypt({ name: "AES-GCM", iv: unb64(env.iv) as BufferSource }, key, unb64(env.data) as BufferSource);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error("Wrong password");
  }
}

const STATUS: Record<string, string> = { planerad: "Planned", pagar: "In progress", klar: "Done", bedomd: "Assessed" };
const STATUS_BACK: Record<string, string> = { ...Object.fromEntries(Object.entries(STATUS).map(([a, b]) => [b, a])), Planerad: "planerad", Pågår: "pagar", Klar: "klar", Bedömd: "bedomd" };
const ORDER = ["planerad", "pagar", "klar", "bedomd"];
/** The same status in a notebook whose choices may be in another language (same order as the kit). */
export const unitStatusIn = (s: string | undefined, options?: string[]) => options?.[ORDER.indexOf(s ?? "")] ?? options?.[0] ?? unitStatus(s);
export const unitStatus = (s?: string) => STATUS[s ?? ""] ?? "Planned";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** The courses in a shared course file or in Lärarbordet's own data file (the current school year only). */
export function readCourses(json: unknown): LbCourse[] {
  const o = json as Record<string, unknown>;
  if (!o || typeof o !== "object") throw new Error("This is not a Lärarbordet file.");
  const unit = (u: Record<string, unknown>): LbUnit => ({
    id: str(u.id),
    title: str(u.title) || "Unit",
    start: str(u.start),
    end: str(u.end),
    desc: str(u.desc),
    contentIds: ids(u.contentIds),
    status: str(u.status) || undefined,
  });
  const lesson = (l: Record<string, unknown>): LbLesson => ({ unitId: str(l.unitId), date: str(l.date), title: str(l.title) || "Lesson", plan: str(l.plan) });
  if (o.type === "lararbordet-kurs") {
    const c = (o.course ?? {}) as Record<string, unknown>;
    return [
      {
        name: str(c.name) || "Course",
        subjectId: str(c.subjectId),
        color: str(c.color) || undefined,
        units: ((o.units as Record<string, unknown>[]) ?? []).map(unit),
        lessons: ((o.lessons as Record<string, unknown>[]) ?? []).map(lesson),
      },
    ];
  }
  if (Array.isArray(o.courses) && Array.isArray(o.units)) {
    const units = (o.units as Record<string, unknown>[]).map((u) => ({ ...unit(u), courseId: str(u.courseId) }));
    const lessons = ((o.lessons as Record<string, unknown>[]) ?? []).map(lesson);
    return (o.courses as Record<string, unknown>[]).map((c) => {
      const mine = units.filter((u) => u.courseId === str(c.id));
      const uids = new Set(mine.map((u) => u.id));
      return {
        name: str(c.name) || "Course",
        subjectId: str(c.subjectId),
        color: str(c.color) || undefined,
        units: mine.map(({ courseId: _c, ...u }) => u),
        lessons: lessons.filter((l) => uids.has(l.unitId)),
      };
    });
  }
  throw new Error("This is not a Lärarbordet file.");
}

/** Monday of the week the school year starts, guessed from the earliest date (school years start in August). */
export function yearStartFor(dates: string[]): string {
  const first = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()[0];
  const now = new Date();
  const y = first ? Number(first.slice(0, 4)) - (Number(first.slice(5, 7)) < 8 ? 1 : 0) : now.getFullYear() - (now.getMonth() < 7 ? 1 : 0);
  const d = new Date(Date.UTC(y, 7, 17));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);

/** A shared course file that Lärarbordet can import (Kurser → Importera delad kurs). */
export function makePackage(course: LbCourse): LbPackage {
  return {
    type: "lararbordet-kurs",
    v: 1,
    exported: today(),
    yearStart: yearStartFor([...course.units.flatMap((u) => [u.start, u.end]), ...course.lessons.map((l) => l.date)]),
    course: { name: course.name, subjectId: course.subjectId, ...(course.color ? { color: course.color } : {}) },
    units: course.units.map(({ status: _s, ...u }) => u),
    lessons: course.lessons,
    assessments: [],
    extra: [],
    custom: null,
  };
}

export const statusForLararbordet = (s: unknown) => STATUS_BACK[String(s)] ?? "planerad";

/** The plan most of these content ids belong to, for a course's subject. */
export function mainPlan(contentIds: string[]): string {
  const count = new Map<string, number>();
  for (const id of contentIds) {
    const p = id.split("~")[0];
    count.set(p, (count.get(p) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}
