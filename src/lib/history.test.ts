import { expect, test } from "vitest";
import { memoryStore } from "./storage";
import { forget, listVersions, snapshot, KEEP } from "./history";

test("history keeps one snapshot per editing window, and prunes", async () => {
  const s = memoryStore("t");
  const t0 = 1_000_000;
  await snapshot(s, "A/p.md", "one", t0);
  await snapshot(s, "A/p.md", "two", t0 + 60_000);
  expect((await listVersions(s, "A/p.md")).length).toBe(1);
  expect(await s.readText((await listVersions(s, "A/p.md"))[0].file)).toBe("two");
  await snapshot(s, "A/p.md", "three", t0 + 10 * 60_000);
  expect((await listVersions(s, "A/p.md")).map((v) => v.time)).toEqual([t0 + 600_000, t0]);
  for (let i = 0; i < KEEP + 5; i++) await snapshot(s, "A/p.md", "v" + i, t0 + (i + 2) * 3_600_000);
  expect((await listVersions(s, "A/p.md")).length).toBe(KEEP);
  await snapshot(s, "x.locked", "secret", t0);
  expect(await listVersions(s, "x.locked")).toEqual([]);
  expect(await forget(s, "A/p.md")).toBe(KEEP);
});
