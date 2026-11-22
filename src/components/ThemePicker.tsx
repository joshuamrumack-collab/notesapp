import { useState } from "react";
import { THEMES, applyTheme, savedTheme } from "../lib/theme";
import { Modal } from "./Modal";

export function ThemePicker({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(savedTheme());
  return (
    <Modal title="Colour theme" onClose={onClose}>
      <div className="theme-grid" role="radiogroup" aria-label="Colour theme">
        {THEMES.map((t) => {
          const [side, page, ink, accent] = t.swatch;
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={current === t.id}
              className={"theme-tile" + (current === t.id ? " chosen" : "")}
              onClick={() => {
                applyTheme(t.id);
                setCurrent(t.id);
              }}
            >
              <span className="theme-mini" aria-hidden>
                <span className="side" style={{ background: side }}>
                  <i style={{ background: accent, width: "70%" }} />
                  <i style={{ background: ink, opacity: 0.35 }} />
                  <i style={{ background: ink, opacity: 0.35, width: "80%" }} />
                </span>
                <span className="main" style={{ background: page }}>
                  <i style={{ background: ink, width: "55%", height: 7 }} />
                  <i style={{ background: ink, opacity: 0.4 }} />
                  <i style={{ background: ink, opacity: 0.4, width: "85%" }} />
                  <i style={{ background: accent, width: "35%" }} />
                </span>
              </span>
              <strong>{t.name}</strong>
              <span className="muted small">{t.note}</span>
            </button>
          );
        })}
      </div>
      <p className="muted small">The theme is saved on this computer and used for every notebook.</p>
    </Modal>
  );
}
