import { useState } from "react";
import { useNB } from "../context";
import { type LbCourse, decryptLararbordet, isEncrypted, mainPlan, makePackage, readCourses, statusForLararbordet, unitStatusIn } from "../lib/lararbordet";
import { getLang } from "../lib/i18n";
import { kitSv } from "../lib/i18n-kits";
import { makeFront } from "../lib/frontmatter";
import { singleLink } from "../lib/links";
import { join } from "../lib/storage";
import { loadCatalog, planLabel } from "../lib/lgr22";
import { asIds } from "./Lgr22";
import { Modal } from "./Modal";
import { t } from "../lib/i18n";

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").trim() || "Course";

/** Bring courses in from Lärarbordet, and send a course back as a shared course file. */
export function LararbordetBridge({ onClose }: { onClose: () => void }) {
  const nb = useNB();
  const [tab, setTab] = useState<"in" | "out">("in");
  const [pending, setPending] = useState<unknown>(null);
  const [password, setPassword] = useState("");
  const [courses, setCourses] = useState<LbCourse[] | null>(null);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const got = (json: unknown) => {
    const cs = readCourses(json);
    setCourses(cs);
    setPick(new Set(cs.map((_, i) => i)));
  };
  const readFile = async (file: File) => {
    setError("");
    setCourses(null);
    try {
      const json = JSON.parse(await file.text());
      if (isEncrypted(json)) setPending(json);
      else got(json);
    } catch (e) {
      setError(e instanceof SyntaxError ? t("Could not read that file.") : t(e instanceof Error ? e.message : String(e)));
    }
  };
  const unlock = async () => {
    setBusy(true);
    setError("");
    try {
      got(await decryptLararbordet(pending as Parameters<typeof decryptLararbordet>[0], password));
      setPending(null);
      setPassword("");
    } catch (e) {
      setError(t(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!courses) return;
    setBusy(true);
    try {
      const cat = await loadCatalog().catch(() => null);
      let units = 0;
      let lessons = 0;
      for (const [i, c] of courses.entries()) {
        if (!pick.has(i)) continue;
        const plan = cat?.plans.get(c.subjectId);
        const sv = getLang() === "sv";
        const unitDir = join(sv ? kitSv.Units : "Units", safe(c.name));
        const lessonDir = join(sv ? kitSv.Lessons : "Lessons", safe(c.name));
        const optionsOf = (card: string) => nb.config.cardTypes.find((x) => x.id === card)?.fields.find((f) => f.key === "status")?.options;
        await nb.store.mkdir(unitDir);
        const paths = new Map<string, string>();
        for (const u of c.units) {
          const front = makeFront({ card: "unit", title: u.title, course: c.name, class: "", start: u.start, end: u.end, status: unitStatusIn(u.status, optionsOf("unit")), content: u.contentIds, lararbordet: u.id });
          paths.set(u.id, await nb.createPage(unitDir, u.title, "md", front + "\n" + (u.desc ? u.desc + "\n\n" : "") + "## Aim\n\n\n## What we do\n\n\n## Assessment\n\n"));
          units++;
        }
        const mine = c.lessons.filter((l) => paths.has(l.unitId));
        if (mine.length) await nb.store.mkdir(lessonDir);
        for (const l of mine) {
          const front = makeFront({
            card: "lesson",
            title: l.title,
            date: l.date,
            class: "",
            subject: plan ? planLabel(plan) : "",
            status: optionsOf("lesson")?.[0] ?? "Planned",
            unit: `[[${nb.index.linkTo(paths.get(l.unitId)!)}]]`,
            content: [],
          });
          await nb.createPage(lessonDir, `${l.date} ${l.title}`, "md", front + "\n" + (l.plan ? l.plan + "\n" : ""));
          lessons++;
        }
      }
      nb.notice(t("Brought in {0} work units and {1} lessons. Find them under Units and Lessons.", units, lessons));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Export: courses are the Course field of work unit cards.
  const unitCards = nb.index.allCards().filter((c) => c.type === "unit");
  const names = [...new Set(unitCards.map((c) => String(c.data.course ?? "").trim()).filter(Boolean))].sort();
  const [course, setCourse] = useState(names[0] ?? "");
  const doExport = async () => {
    setBusy(true);
    try {
      const units = unitCards.filter((c) => String(c.data.course ?? "").trim() === course);
      const idOf = new Map(units.map((u, i) => [u.path + (u.nodeId ?? ""), String(u.data.lararbordet || `nb${i + 1}-${Date.now().toString(36)}`)]));
      const lessons = nb.index.allCards().filter((c) => c.type === "lesson");
      const lb: LbCourse = {
        name: course,
        subjectId: mainPlan(units.flatMap((u) => asIds(u.data.content))),
        units: units.map((u) => ({
          id: idOf.get(u.path + (u.nodeId ?? ""))!,
          title: String(u.data.title || u.title),
          start: String(u.data.start ?? ""),
          end: String(u.data.end ?? ""),
          desc: nb.index.pages.get(u.path)?.summary.slice(0, 2000) ?? "",
          contentIds: asIds(u.data.content),
          status: statusForLararbordet(u.data.status),
        })),
        lessons: lessons.flatMap((l) => {
          const target = singleLink(l.data.unit);
          const hit = target ? nb.index.resolve(target, l.path) : null;
          const unit = hit ? units.find((u) => u.path === hit) : undefined;
          if (!unit) return [];
          return [{ unitId: idOf.get(unit.path + (unit.nodeId ?? ""))!, date: String(l.data.date ?? ""), title: String(l.data.title || l.title), plan: nb.index.pages.get(l.path)?.summary.slice(0, 2000) ?? "" }];
        }),
      };
      const text = JSON.stringify(makePackage(lb), null, 1);
      const name = `${safe(course)}.lararbordet.json`;
      await nb.store.writeText(name, text);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.download = name;
      a.click();
      nb.notice(t("Saved {0} in the notebook folder. In Lärarbordet: Planning → Import course.", name));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("Lärarbordet")} onClose={onClose}>
      <div className="tabs">
        <button className={tab === "in" ? "selected" : ""} onClick={() => setTab("in")}>
          {t("Bring courses in")}
        </button>
        <button className={tab === "out" ? "selected" : ""} onClick={() => setTab("out")}>
          {t("Send a course to Lärarbordet")}
        </button>
      </div>
      {tab === "in" && (
        <>
          <p>{t("Choose a shared course file (.lararbordet.json) or Lärarbordet's own data file (lararbordet.json in Documents\\Lärarbordet).")}</p>
          <p className="muted small">{t("Only courses, work units with their central content, and lessons are read. Pupils, groups, grades and assessments are never read or copied.")}</p>
          <input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
          {pending !== null && (
            <form className="row" onSubmit={(e) => (e.preventDefault(), unlock())}>
              <span>{t("The file is password protected.")}</span>
              <input type="password" autoFocus placeholder={t("Password")} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button disabled={busy || !password}>{t("Unlock")}</button>
            </form>
          )}
          {courses && (
            <ul className="plain-list">
              {courses.map((c, i) => (
                <li key={i}>
                  <label>
                    <input type="checkbox" checked={pick.has(i)} onChange={() => setPick((p) => (p.has(i) ? new Set([...p].filter((x) => x !== i)) : new Set([...p, i])))} />{" "}
                    <b>{c.name}</b> <span className="muted small">{t("{0} work units, {1} lessons", c.units.length, c.lessons.length)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button onClick={onClose}>{t("Cancel")}</button>
            <button className="primary" disabled={busy || !courses || pick.size === 0} onClick={doImport}>
              {busy ? t("Working…") : t("Bring in")}
            </button>
          </div>
        </>
      )}
      {tab === "out" && (
        <>
          <p>{t("Makes a shared course file from the work units with this Course, and the lessons linked to them. Lärarbordet moves the dates to the same weeks of its school year.")}</p>
          {names.length ? (
            <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label={t("Course")}>
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          ) : (
            <p className="muted">{t("No work unit has a Course yet. Fill in Course on your work unit cards first.")}</p>
          )}
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button onClick={onClose}>{t("Cancel")}</button>
            <button className="primary" disabled={busy || !course} onClick={doExport}>
              {busy ? t("Working…") : t("Save course file")}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
