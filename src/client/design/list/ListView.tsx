// ListView — the assembled List view: ListSections stacked on the canvas, centred at 900px, ending in
// "Add another list". One Tab stop through KeyNav. Spec: DESIGN.md › Views › List.
import type { CSSProperties, ReactNode, Ref } from "react";

import { Icon } from "../core/Icon";
import { KeyNav, type KeyNavProps } from "../core/KeyNav";
import "./ListView.css";

export interface ListViewProps extends Pick<KeyNavProps, "onMoveItem" | "onItemKey" | "onItemSelect"> {
  children?: ReactNode;
  onAddList?: () => void;
  /** @default true */
  showAddList?: boolean;
  /** Spread onto the root: the drag-and-drop handlers of the view */
  rootProps?: Record<string, unknown>;
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  className?: string;
}

export function ListView({ children, onAddList, showAddList = true, onMoveItem, onItemKey, onItemSelect, rootProps, ref, style, className }: ListViewProps) {
  return (
    <KeyNav ref={ref} className={["td-listview", className ?? ""].join(" ").trim()} style={style} itemSelector=".td-lrow" onMoveItem={onMoveItem} onItemKey={onItemKey} onItemSelect={onItemSelect} {...rootProps}>
      <div className="td-listview-inner">
        {children}
        {showAddList ? (
          <button type="button" className="td-listview-addlist" onClick={onAddList}>
            <Icon name="plus" size={16} />
            Add another list
          </button>
        ) : null}
      </div>
    </KeyNav>
  );
}
