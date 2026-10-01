// Button — neutral "subtle" fill by default; hover shifts background only (no movement).
// Contract: the design system's components/core/Button.d.ts. Spec: DESIGN.md › Core controls.
import type { ComponentPropsWithRef } from "react";

import { Icon, type IconName } from "./Icon";
import "./Button.css";

export type ButtonVariant = "primary" | "subtle" | "outline" | "ghost" | "chrome" | "chrome-ghost" | "inverse" | "danger";

export interface ButtonProps extends Omit<ComponentPropsWithRef<"button">, "type"> {
  /** primary = blue CTA; subtle = neutral fill (default); outline = bordered card surface; ghost = transparent;
   *  chrome / chrome-ghost = on the app frame; inverse = light solid on chrome; danger = red, only as the confirm
   *  button of a destructive ConfirmDialog. @default "subtle" */
  variant?: ButtonVariant;
  /** @default "md" (32px). "lg" = 40px */
  size?: "md" | "lg";
  /** Leading icon */
  icon?: IconName;
  /** Trailing icon */
  iconAfter?: IconName;
  type?: "button" | "submit" | "reset";
}

export function Button({
  variant = "subtle",
  size = "md",
  icon,
  iconAfter,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = ["td-btn", variant !== "subtle" ? `td-btn-${variant}` : "", size === "lg" ? "td-btn-lg" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={16} /> : null}
    </button>
  );
}
