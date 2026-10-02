// BoardView — the assembled Board: ListColumns on the canvas, horizontal scroll, "Add another list".
// One Tab stop through KeyNav (arrows move across cards and columns). Spec: DESIGN.md › Views › Board.
import type { CSSProperties, ReactNode, Ref } from "react";

import { Icon } from "../core/Icon";
import { KeyNav, type KeyNavProps } from "../core/KeyNav";
import "./BoardView.css";

export interface BoardViewProps extends Pick<KeyNavProps, "onMoveItem" | "onItemKey" | "onItemSelect"> {
  children?: ReactNode;
  onAddList?: () => void;
  /** @default true */
  showAddList?: boolean;
  /** Beside "Add another list" (the hidden-lists menu) */
  after?: ReactNode;
  /** Spread onto the root: the drag-and-drop handlers of the view */
  rootProps?: Record<string, unknown>;
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  className?: string;
}

export function BoardView({ children, onAddList, showAddList = true, after, onMoveItem, onItemKey, onItemSelect, rootProps, ref, style, className }: BoardViewProps) {
  return (
    <KeyNav ref={ref} className={["td-board", className ?? ""].join(" ").trim()} style={style} itemSelector=".td-card" columnSelector=".td-list" onMoveItem={onMoveItem} onItemKey={onItemKey} onItemSelect={onItemSelect} {...rootProps}>
      {children}
      {showAddList || after ? (
        <div className="td-board-tail">
          {showAddList ? (
            <button type="button" className="td-board-addlist" onClick={onAddList}>
              <Icon name="plus" size={16} />
              Add another list
            </button>
          ) : null}
          {after}
        </div>
      ) : null}
    </KeyNav>
  );
}
