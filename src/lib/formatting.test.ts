// @vitest-environment jsdom
import { expect, test } from "vitest";
import { roundTrip } from "./md";
test("word-style formatting survives Markdown", () => {
  for (const md of [
    'a <span style="color: #c53030">red</span> b',
    "a ==hl== b",
    "H<sub>2</sub>O x<sup>2</sup>",
    '<p style="text-align: center">mid <strong>bold</strong> [[Page]]</p>\n\nnext',
    '<h2 style="text-align: right">Right</h2>',
    "a <u>und</u> b",
    '<span style="font-size: 20px">big</span>',
    "# Title\n\nplain *it*",
  ]) {
    const once = roundTrip(md);
    process.stderr.write(JSON.stringify(md) + " => " + JSON.stringify(once) + "\n");
    expect(roundTrip(once)).toBe(once);
  }
});

test("alignment works next to underline and highlight (editor syntax registered)", () => {
  const md = '<p style="text-align: center">a <u>u</u> ==h==</p>';
  expect(() => roundTrip(md)).not.toThrow();
  expect(roundTrip(roundTrip(md))).toBe(roundTrip(md));
  expect(roundTrip(md)).toContain("<mark>h</mark>");
  expect(roundTrip(md)).not.toContain("==");
});
