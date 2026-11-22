// @vitest-environment node
import { expect, test } from "vitest";
import { lockText, readLockedHeader, unlockText } from "./crypto";

test("lock and unlock", async () => {
  const locked = await lockText("secret pupil note", "hunter2", "md");
  expect(locked).not.toContain("secret");
  expect(readLockedHeader(locked).kind).toBe("md");
  expect((await unlockText(locked, "hunter2")).text).toBe("secret pupil note");
  await expect(unlockText(locked, "wrong")).rejects.toThrow("Wrong password");
  const again = await lockText("secret pupil note", "hunter2", "md");
  expect(again).not.toBe(locked);
}, 30000);
