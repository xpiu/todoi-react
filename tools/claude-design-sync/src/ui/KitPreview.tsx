// A kit file rendered live from a snapshot or staging folder (served at /kit/… by the tool itself).
// The page needs scripts for its React bundle and the tool's origin for its module scripts, fonts and
// stored theme, so the sandbox doesn't isolate it; it still blocks forms, popups, modals and navigating
// the tool away. What it renders is the developer's own Design project, on a loopback-only server.
export function KitPreview({ title, src, lazy = false }: { title: string; src: string; lazy?: boolean }) {
  return (
    <div className="cds-preview">
      {/* oxlint-disable-next-line react/iframe-missing-sandbox -- both tokens are needed, see above */}
      <iframe title={title} src={src} loading={lazy ? "lazy" : undefined} sandbox="allow-scripts allow-same-origin" />
    </div>
  );
}
