import { describe, expect, test } from "vitest";
import { decryptLararbordet, mainPlan, makePackage, readCourses, yearStartFor } from "./lararbordet";
import { buildCatalog } from "./lgr22";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const pkg = {
  type: "lararbordet-kurs", v: 1, exported: "2026-09-01", yearStart: "2026-08-17",
  course: { name: "Svenska 8B", subjectId: "GRGRSVE01/7-9", color: "#123" },
  units: [{ id: "u1", title: "Noveller", start: "2026-08-24", end: "2026-09-25", desc: "Läsa och skriva", contentIds: ["GRGRSVE01/7-9~1.1", "GRGRSVE01/7-9~2.3"] }],
  lessons: [{ unitId: "u1", date: "2026-08-25", title: "Vad är en novell?", plan: "Läsa tillsammans" }],
  assessments: [{ title: "Novellskrivning" }], extra: [], custom: null,
};

describe("Lärarbordet", () => {
  test("reads a shared course file", () => {
    const [c] = readCourses(pkg);
    expect(c.name).toBe("Svenska 8B");
    expect(c.units[0].contentIds).toHaveLength(2);
    expect(c.lessons[0].title).toBe("Vad är en novell?");
  });
  test("reads the data file without pupils or grades", () => {
    const state = {
      v: 2, courses: [{ id: "c1", name: "Ma 8B", subjectId: "GRGRMAT01/7-9" }, { id: "c2", name: "Sv", subjectId: "x" }],
      units: [{ id: "u", courseId: "c1", title: "Bråk", status: "pagar", contentIds: [] }],
      lessons: [{ unitId: "u", date: "2026-09-01", title: "L1" }],
      pupils: [{ name: "Secret Pupil" }], grades: { a: 1 },
    };
    const cs = readCourses(state);
    expect(cs.map((c) => c.name)).toEqual(["Ma 8B", "Sv"]);
    expect(cs[0].units[0].status).toBe("pagar");
    expect(JSON.stringify(cs)).not.toContain("Secret Pupil");
  });
  test("round-trips a course", () => {
    const out = makePackage(readCourses(pkg)[0]);
    expect(out.type).toBe("lararbordet-kurs");
    expect(out.yearStart).toBe("2026-08-17");
    expect(out.units[0]).toEqual(pkg.units[0]);
    expect(out.assessments).toEqual([]);
  });
  test("year start and main plan", () => {
    expect(yearStartFor(["2027-03-02"])).toBe("2026-08-17");
    expect(mainPlan(["A~1.1", "B~1.1", "B~2.1"])).toBe("B");
  });
  test("opens an encrypted file", async () => {
    const c = globalThis.crypto.subtle;
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await c.importKey("raw", new TextEncoder().encode("hemligt"), "PBKDF2", false, ["deriveKey"]);
    const key = await c.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 1000 }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const ct = new Uint8Array(await c.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(pkg))));
    const b = (u: Uint8Array) => btoa(String.fromCharCode(...u));
    const env = { format: "lararbordet-krypterad" as const, v: 1, kdf: "PBKDF2-SHA256", iter: 1000, salt: b(salt), iv: b(iv), data: b(ct) };
    expect(readCourses(await decryptLararbordet(env, "hemligt"))[0].name).toBe("Svenska 8B");
    await expect(decryptLararbordet(env, "fel")).rejects.toThrow("Wrong password");
  });
  test("catalogue ids match Lärarbordet's", () => {
    const cat = buildCatalog(JSON.parse(gunzipSync(readFileSync("public/lgr22-catalog.json.gz")).toString()));
    const hit = cat.items.get("GRGRSVE01/7-9~1.1");
    expect(hit?.plan.subject).toMatch(/Svenska/);
    expect(cat.plans.size).toBeGreaterThan(100);
  });
});
