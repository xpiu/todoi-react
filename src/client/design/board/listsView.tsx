// What the Board (BoardView) and the List view (ListView) share: the same props around their KeyNav, and the
// "Add another list" tail. Each view keeps its own root markup, classes and KeyNav selectors.
import type { CSSProperties, ReactNode, Ref } from "react";

import { Icon } from "../core/Icon";
import type { KeyNavProps } from "../core/KeyNav";

export interface ListsViewProps extends Pick<KeyNavProps, "onMoveItem" | "onItemKey" | "onItemSelect"> {
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

export interface AddListTailProps extends Pick<ListsViewProps, "onAddList" | "showAddList" | "after"> {
  /** The view's own tail class */
  className: string;
  /** The view's own "Add another list" button class */
  buttonClassName: string;
}

/** "Add another list" and `after`; renders nothing when both are off. */
export function AddListTail({ onAddList, showAddList = true, after, className, buttonClassName }: AddListTailProps) {
  if (!showAddList && !after) return null;
  return (
    <div className={className}>
      {showAddList ? (
        <button type="button" className={buttonClassName} onClick={onAddList}>
          <Icon name="plus" size={16} />
          Add another list
        </button>
      ) : null}
      {after}
    </div>
  );
}
