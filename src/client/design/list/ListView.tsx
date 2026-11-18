// ListView — the assembled List view: ListSections stacked on the canvas, centred at 900px, ending in
// "Add list". One Tab stop through KeyNav. Spec: DESIGN.md › Views › List.
import { AddListTail, type ListsViewProps } from "../board/listsView";
import { KeyNav } from "../core/KeyNav";
import "./ListView.css";

export type ListViewProps = ListsViewProps;

export function ListView({ children, onAddList, showAddList, after, rootProps, className, ...nav }: ListViewProps) {
  return (
    <KeyNav {...nav} className={["td-list-view", className ?? ""].join(" ").trim()} itemSelector=".td-list-row" sectionSelector=".td-list-section" {...rootProps}>
      <div className="td-list-view-inner">
        {children}
        <AddListTail className="td-list-view-tail" buttonClassName="td-list-view-addlist" onAddList={onAddList} showAddList={showAddList} after={after} />
      </div>
    </KeyNav>
  );
}
