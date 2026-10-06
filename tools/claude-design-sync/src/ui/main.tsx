import "./styles.css";

import { createRoot } from "react-dom/client";

import { App } from "./App";
import { Guide } from "./Guide";
import { Mapping } from "./Mapping";
import { Tooltips } from "./Tooltip";

const guide = location.pathname === "/guide";
if (guide) document.title = "Guide · Claude Design sync tool";
const mapping = location.pathname.startsWith("/mapping");
if (mapping) document.title = "Mapping · Claude Design sync tool";
createRoot(document.getElementById("root")!).render(
  <>
    {guide ? <Guide /> : mapping ? <Mapping /> : <App />}
    <Tooltips />
  </>,
);
