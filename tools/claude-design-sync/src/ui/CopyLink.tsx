// Clipboard feedback with selectable text when the browser refuses access.
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CopyLink({ text, label, tip }: { text: string; label: string; tip: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [copying, setCopying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <span className="cds-copy">
      <button
        type="button"
        className="cds-link"
        disabled={copying}
        data-tip={status === "copied" ? "Copied to the clipboard" : tip}
        aria-live="polite"
        onClick={async () => {
          if (timer.current) clearTimeout(timer.current);
          setCopying(true);
          try {
            await navigator.clipboard.writeText(text);
            setStatus("copied");
            timer.current = setTimeout(() => setStatus("idle"), 1400);
          } catch {
            setStatus("failed");
          } finally {
            setCopying(false);
          }
        }}
      >
        {status === "copied" ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} {status === "copied" ? "Copied" : label}
      </button>
      {status === "failed" ? (
        <span className="cds-copy-fallback">
          <span role="alert" className="cds-error-inline">Couldn’t copy. Select the text below and copy it manually.</span>
          <label className="cds-field">
            <span>{label} text</span>
            <textarea readOnly value={text} rows={4} onFocus={(e) => e.currentTarget.select()} />
          </label>
        </span>
      ) : null}
    </span>
  );
}
