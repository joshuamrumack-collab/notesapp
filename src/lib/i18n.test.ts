import { expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { missingSwedish } from "./i18n";
import { builtInKits } from "./kits";
import { kitSv, translateKit } from "./i18n-kits";

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : /\.tsx?$/.test(n) && !n.includes(".test.") ? [join(dir, n)] : []));

test("every interface text has Swedish", () => {
  const keys = new Set<string>();
  for (const f of files("src")) for (const m of readFileSync(f, "utf8").matchAll(/\b(?:t|tr)\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
  expect(missingSwedish([...keys])).toEqual([]);
});

test("built-in kits translate fully, ids stay the same", () => {
  for (const k of builtInKits) {
    const sv = translateKit(k);
    expect(sv.cardTypes.map((c) => c.id)).toEqual(k.cardTypes.map((c) => c.id));
    for (const c of k.cardTypes) {
      expect(kitSv[c.name], c.name).toBeTruthy();
      for (const f of c.fields) {
        if (!/^[A-Z]{1,4}$|^Init$|^Mod$/.test(f.label)) expect(kitSv[f.label], f.label).toBeTruthy();
        for (const o of f.options ?? []) if (!/^[A-Z]{1,2}$/.test(o)) expect(kitSv[o], o).toBeTruthy();
      }
    }
    for (const v of k.views) expect(kitSv[v.name], v.name).toBeTruthy();
    for (const s of k.sections) expect(kitSv[s], s).toBeTruthy();
  }
  const teacher = translateKit(builtInKits.find((k) => k.id === "teacher")!);
  expect(teacher.templates.find((t) => t.name === "Arbetsområde")?.content).toContain("status: Planerad");
});
