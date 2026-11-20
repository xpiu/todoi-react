// TextField — single-line input or textarea. Contract: components/core/TextField.d.ts.
import type { ComponentPropsWithRef } from "react";

import { Icon, type IconName } from "./Icon";
import "./TextField.css";

type InputProps = ComponentPropsWithRef<"input">;
type TextareaProps = ComponentPropsWithRef<"textarea">;

interface Common {
  /** Translucent white-on-chrome styling (top-bar search) */
  dark?: boolean;
  /** Leading icon inside the field, e.g. "search" */
  icon?: IconName;
  /** The icon's drawn size: a pixel-snapped glyph must be drawn at the size it shows at @default 16 */
  iconSize?: number;
}

export type TextFieldProps =
  | (Common & { multiline?: false } & Omit<InputProps, "children">)
  | (Common & { multiline: true } & Omit<TextareaProps, "children">);

export function TextField(props: TextFieldProps) {
  const { dark, icon, iconSize = 16, className, ...rest } = props;
  const cls = ["td-field", dark ? "td-field-dark" : "", icon ? "td-field-hasicon" : "", className ?? ""].filter(Boolean).join(" ");
  let field;
  if (rest.multiline) {
    const { multiline: _m, rows = 3, ...ta } = rest;
    field = <textarea className={cls} rows={rows} {...ta} />;
  } else {
    const { multiline: _m, type = "text", ...inp } = rest;
    field = <input className={cls} type={type} {...inp} />;
  }
  if (!icon) return field;
  return (
    <div className={"td-field-wrap" + (dark ? " td-field-wrap-dark" : "")}>
      {field}
      <span className="td-field-icon">
        <Icon name={icon} size={iconSize} />
      </span>
    </div>
  );
}
