import { lazy, Suspense } from "react";

import { ItemList } from "./items/ItemList";

// Dev gallery of the design primitives (/dev/ds). A pathname check stands in for routing until Phase 4.
const DesignGallery = lazy(() => import("./dev/DesignGallery").then((m) => ({ default: m.DesignGallery })));

export function App() {
  if (typeof location !== "undefined" && location.pathname === "/dev/ds") {
    return (
      <Suspense fallback={null}>
        <DesignGallery />
      </Suspense>
    );
  }
  return (
    <div className="td-app">
      <main className="td-app-main">
        <h1 className="td-app-title">Todoi</h1>
        <ItemList />
      </main>
    </div>
  );
}
