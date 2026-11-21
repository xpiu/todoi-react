// TableAddRow — creating is a table page's last row (Projects, Project groups), in the List view's "Add an item" idiom.
import { Icon } from "../design/core/Icon";
import "./tables.css";

export function TableAddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="td-table-add" onClick={onClick}>
      <span className="td-table-add-plus">
        <Icon name="plus" size={16} />
      </span>
      {label}
    </button>
  );
}
