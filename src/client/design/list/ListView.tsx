// ListView — the assembled List view: ListSections stacked on the canvas, centred at 900px, ending in
// "Add another list". One Tab stop through KeyNav. Spec: DESIGN.md › Views › List.
import { AddListTail, type ListsViewProps } from "../board/listsView";
import { KeyNav } from "../core/KeyNav";
import "./ListView.css";

export type ListViewProps = ListsViewProps;

export function ListView({ children, onAddList, showAddList, after, rootProps, className, ...nav }: ListViewProps) {
  return (
    <KeyNav {...nav} className={["td-listview", className ?? ""].join(" ").trim()} itemSelector=".td-lrow" sectionSelector=".td-lsec" {...rootProps}>
      <div className="td-listview-inner">
        {children}
        <AddListTail className="td-listview-tail" buttonClassName="td-listview-addlist" onAddList={onAddList} showAddList={showAddList} after={after} />
      </div>
    </KeyNav>
  );
}
