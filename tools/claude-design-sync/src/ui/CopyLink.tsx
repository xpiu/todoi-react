// A link that copies text to the clipboard and says so for a moment.
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyLink({ text, label, tip }: { text: string; label: string; tip: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="cds-link"
      data-tip={copied ? "Copied to the clipboard" : tip}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} {copied ? "Copied" : label}
    </button>
  );
}
