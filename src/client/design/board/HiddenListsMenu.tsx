// HiddenListsMenu — the way back to hidden lists, after "Add another list" in the Board and List views:
// a quiet "2 hidden lists" button opening a menu of the lists (with their item counts) to show again, and
// Show all. Hiding is project-wide, so the menu says so. Spec: DESIGN.md › Lists & Status linking.
import { Icon } from "../core/Icon";
import { MenuDivider, MenuItem, MenuNote, MenuPopover } from "../core/Menu";
import { count } from "../core/text";
import "./HiddenListsMenu.css";

export interface HiddenListsMenuProps {
  lists: Array<{ id: string; name: string; count: number }>;
  /** Show these lists again */
  onShow: (ids: string[]) => void;
}

export function HiddenListsMenu({ lists, onShow }: HiddenListsMenuProps) {
  if (!lists.length) return null;
  const label = count(lists.length, "hidden list");
  return (
    <MenuPopover
      label="Hidden lists"
      placement="bottom-start"
      minWidth={240}
      trigger={
        <button type="button" className="td-hiddenlists">
          <Icon name="eye-off" size={16} />
          {label}
        </button>
      }
    >
      {(close) => (
        <>
          {lists.map((l) => (
            <MenuItem
              key={l.id}
              icon="eye"
              trailing={l.count ? String(l.count) : undefined}
              onSelect={() => {
                close();
                onShow([l.id]);
              }}
            >
              Show “{l.name}”
            </MenuItem>
          ))}
          {lists.length > 1 ? (
            <>
              <MenuDivider />
              <MenuItem
                icon="eye"
                onSelect={() => {
                  close();
                  onShow(lists.map((l) => l.id));
                }}
              >
                Show all
              </MenuItem>
            </>
          ) : null}
          <MenuNote>Hidden lists and their items are hidden for everyone in this project.</MenuNote>
        </>
      )}
    </MenuPopover>
  );
}
