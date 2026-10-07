// A native select drawn as the tool's underline field, with a lucide chevron in place of the platform's own
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

export function Select(props: ComponentProps<"select">) {
  return (
    <span className="cds-select">
      <select {...props} />
      <ChevronDown size={12} strokeWidth={1.75} className="cds-select-chev" aria-hidden />
    </span>
  );
}
