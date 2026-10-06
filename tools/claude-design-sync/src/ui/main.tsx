import "./styles.css";

import { createRoot } from "react-dom/client";

import { App } from "./App";
import { Mapping } from "./Mapping";
import { Tooltips } from "./Tooltip";

const mapping = location.pathname.startsWith("/mapping");
if (mapping) document.title = "Mapping · Claude Design sync tool";
createRoot(document.getElementById("root")!).render(
  <>
    {mapping ? <Mapping /> : <App />}
    <Tooltips />
  </>,
);
