// ItemSection — a titled block in the overlay's main column (Attachments, Relations): 16px glyph,
// 16/22 semibold title, an optional action at the trailing edge, the body inset under the title.
import type { CSSProperties, ReactNode } from "react";

import { Icon, type IconName } from "../core/Icon";
import "./ItemSection.css";

export interface ItemSectionProps {
  icon?: IconName;
  title: ReactNode;
  action?: ReactNode;
  /** @default true — body starts under the title text, not the glyph */
  inset?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function ItemSection({ icon, title, action, inset = true, children, style, className }: ItemSectionProps) {
  return (
    <div className={["td-isec", className ?? ""].join(" ").trim()} style={style}>
      <div className="td-isec-head">
        {icon ? <Icon name={icon} size={16} /> : <span className="td-isec-spacer" />}
        <span className="td-isec-title">{title}</span>
        {action ?? null}
      </div>
      {children ? <div className={"td-isec-body" + (inset ? " is-inset" : "")}>{children}</div> : null}
    </div>
  );
}
