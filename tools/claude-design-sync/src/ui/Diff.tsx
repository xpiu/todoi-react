// A unified diff, read like a ledger: additions inked, removals struck, context grey.
export function Diff({ text }: { text: string | null }) {
  if (text === null) return <div className="cds-diff is-loading" aria-busy="true"><span className="cds-skel" /><span className="cds-skel" style={{ width: "60%" }} /></div>;
  if (!text.trim()) return <div className="cds-diff"><p className="cds-quiet">No textual difference.</p></div>;
  const lines = text.split("\n").filter((l) => !/^(diff --git|index |similarity|new file mode|deleted file mode)/.test(l)).slice(0, 1500);
  return (
    <div className="cds-diff" role="region" aria-label="Diff">
      <pre>
        {lines.map((l, i) => {
          const k = l.startsWith("+++") || l.startsWith("---") ? "file" : l.startsWith("@@") ? "hunk" : l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "ctx";
          return (
            <span key={i} className={`cds-dl cds-dl-${k}`}>
              {l || " "}
              {"\n"}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
