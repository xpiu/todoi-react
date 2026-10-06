import { useState } from "react";

// A unified diff, read like a ledger: additions inked, removals struck, context grey.
export function Diff({ text }: { text: string | null }) {
  if (text === null) return <div className="cds-diff is-loading" aria-busy="true"><span className="cds-skel" /><span className="cds-skel" style={{ width: "60%" }} /></div>;
  if (!text.trim()) return <div className="cds-diff"><p className="cds-quiet">No textual difference.</p></div>;
  return <DiffLines key={text} text={text} />;
}

function DiffLines({ text }: { text: string }) {
  const [limit, setLimit] = useState(1500);
  const lines = text.split("\n").filter((l) => !/^(diff --git|index |similarity|new file mode|deleted file mode)/.test(l));
  return (
    <div className="cds-diff" role="region" aria-label="Diff">
      <pre>
        {lines.slice(0, limit).map((l, i) => {
          const k = l.startsWith("+++") || l.startsWith("---") ? "file" : l.startsWith("@@") ? "hunk" : l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "ctx";
          return (
            <span key={i} className={`cds-dl cds-dl-${k}`}>
              {l || " "}
              {"\n"}
            </span>
          );
        })}
      </pre>
      {lines.length > 1500 ? (
        <div className="cds-diff-more">
          <span className="cds-quiet" role="status">Showing {Math.min(limit, lines.length).toLocaleString()} of {lines.length.toLocaleString()} lines.</span>
          {limit < lines.length ? <button type="button" className="cds-link" data-tip="Reveal the next 1,500 lines of this diff" onClick={() => setLimit((n) => n + 1500)}>Show more lines</button> : null}
        </div>
      ) : null}
    </div>
  );
}
