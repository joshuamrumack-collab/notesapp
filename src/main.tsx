import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, savedTheme } from "./lib/theme";
import { getLang } from "./lib/i18n";

// Before the first paint, so there is no flash of the wrong colours.
applyTheme(savedTheme(), false);
document.documentElement.lang = getLang();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// A drop outside a page must not make the window open the dropped file in place of the app.
for (const type of ["dragover", "drop"]) window.addEventListener(type, (e) => e.preventDefault());
