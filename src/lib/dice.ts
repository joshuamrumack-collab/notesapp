// Dice expressions like "2d6+3", "d20", "4d6kh3", "2d20kl1 - 1".
export interface Roll {
  expr: string;
  total: number;
  detail: string;
}

const TERM = /([+-])?\s*(?:(\d*)d(\d+|%)(?:(kh|kl)(\d+))?|(\d+))/gi;

export function roll(expr: string, rng: () => number = Math.random): Roll {
  const src = expr.trim();
  if (!src) throw new Error("Type a roll, for example 2d6+3");
  let total = 0;
  const parts: string[] = [];
  let used = 0;
  for (const m of src.matchAll(TERM)) {
    const before = src.slice(used, m.index).trim();
    if (before) throw new Error(`Did not understand "${before}"`);
    used = m.index + m[0].length;
    if (m.index > 0 && !m[1]) throw new Error("Put + or - between dice");
    const sign = m[1] === "-" ? -1 : 1;
    if (m[6] !== undefined) {
      total += sign * Number(m[6]);
      parts.push(`${sign < 0 ? "- " : parts.length ? "+ " : ""}${m[6]}`);
      continue;
    }
    const count = m[2] ? Number(m[2]) : 1;
    const sides = m[3] === "%" ? 100 : Number(m[3]);
    if (count < 1 || count > 200 || sides < 2 || sides > 1000) throw new Error("Use 1-200 dice with 2-1000 sides");
    const dice = Array.from({ length: count }, () => 1 + Math.floor(rng() * sides));
    let kept = dice.map((v, i) => ({ v, i }));
    if (m[4]) {
      const keep = Math.min(Number(m[5]), count);
      kept = [...kept].sort((a, b) => (m[4].toLowerCase() === "kh" ? b.v - a.v : a.v - b.v)).slice(0, keep);
    }
    const keptIdx = new Set(kept.map((k) => k.i));
    const sum = kept.reduce((s, k) => s + k.v, 0);
    total += sign * sum;
    const shown = dice.map((v, i) => (keptIdx.has(i) ? String(v) : `~${v}~`)).join(", ");
    parts.push(`${sign < 0 ? "- " : parts.length ? "+ " : ""}[${shown}]`);
  }
  if (src.slice(used).trim() || !parts.length) throw new Error(`Did not understand "${src.slice(used).trim() || src}"`);
  return { expr: src, total, detail: parts.join(" ") };
}
