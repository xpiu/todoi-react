// BoardView — the assembled Board: ListColumns on the canvas, horizontal scroll, "Add another list".
// One Tab stop through KeyNav (arrows move across cards and columns). Spec: DESIGN.md › Views › Board.
import { KeyNav } from "../core/KeyNav";
import { AddListTail, type ListsViewProps } from "./listsView";
import "./BoardView.css";

export type BoardViewProps = ListsViewProps;

export function BoardView({ children, onAddList, showAddList, after, rootProps, className, ...nav }: BoardViewProps) {
  return (
    <KeyNav {...nav} className={["td-board", className ?? ""].join(" ").trim()} itemSelector=".td-card" columnSelector=".td-list" {...rootProps}>
      {children}
      <AddListTail className="td-board-tail" buttonClassName="td-board-addlist" onAddList={onAddList} showAddList={showAddList} after={after} />
    </KeyNav>
  );
}
