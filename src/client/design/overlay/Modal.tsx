// Modal — the item overlay shell on Base UI Dialog: 880px card in a scrolling backdrop, optional
// 128px cover strip, corner controls, a title row, the main column and the 376px aside. On phones
// (or with `sheet`) it fills the viewport and stacks: sticky title row, aside as a section, then
// the content. Popovers opened inside portal into the popup. Spec: DESIGN.md › Item overlay, Responsive.
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { PortalContainerContext } from "../core/portalContainer";
import { useViewport } from "../core/viewport";
import "./Modal.css";

export interface ModalCover {
  src?: string;
  color?: string;
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  cover?: ModalCover | null;
  /** Key · link · ⋯ · close */
  corner?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  width?: number | string;
  /** Force (true) or refuse (false) the phone sheet; default follows the viewport */
  sheet?: boolean;
  /** Spread onto the card (file-drop handlers) */
  rootProps?: Record<string, unknown>;
  "aria-label"?: string;
  style?: CSSProperties;
}

export function Modal({ open, onClose, title, cover, corner, aside, children, width, sheet: sheetProp, rootProps, style, ...rest }: ModalProps) {
  const vp = useViewport();
  const sheet = sheetProp ?? vp.phone;
  const [popupEl, setPopupEl] = useState<HTMLElement | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  // The title row sits above the two-column body; cap it to the main column's width so it lines up.
  useLayoutEffect(() => {
    const t = titleRef.current, root = popupEl, a = asideRef.current;
    if (!t) return;
    const measure = () => {
      if (!root || !a || sheet) {
        t.style.maxWidth = "";
        t.classList.remove("is-measured");
        return;
      }
      const w = root.clientWidth - a.offsetWidth - 40;
      t.style.maxWidth = w > 0 ? `${w}px` : "";
      t.classList.toggle("is-measured", w > 0);
    };
    measure();
    if (typeof ResizeObserver === "undefined" || !root) return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (a) ro.observe(a);
    return () => ro.disconnect();
  }, [popupEl, sheet, aside]);
  const flush = (!cover && !!title) || (sheet && !!title);
  const cornerEl = corner ? <div className={"td-modal-corner" + (flush ? " is-flush" : cover ? "" : " is-band")}>{corner}</div> : null;
  return (
    <BaseDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="td-modal-backdrop" />
        <BaseDialog.Viewport className={"td-modal-viewport" + (sheet ? " is-sheet" : "")}>
          <BaseDialog.Popup className={"td-modal" + (sheet ? " is-sheet" : "")} ref={setPopupEl} aria-label={rest["aria-label"]} style={{ ...(width != null && !sheet ? { width } : null), ...style }} {...rootProps}>
            <PortalContainerContext.Provider value={popupEl}>
              {flush ? (
                <div className="td-modal-head">
                  <div className="td-modal-head-title" ref={titleRef}>
                    {title}
                  </div>
                  {cornerEl}
                </div>
              ) : (
                cornerEl
              )}
              {cover ? (
                <div className="td-modal-cover" style={cover.color ? { background: cover.color } : cover.src ? { background: "var(--surface-card)" } : undefined}>
                  {cover.src ? <img src={cover.src} alt="" /> : null}
                </div>
              ) : null}
              <div className="td-modal-body">
                <div className={"td-modal-main" + (flush ? " is-flush" : "")}>
                  {flush ? null : title}
                  {children}
                </div>
                {aside ? (
                  <div className="td-modal-aside" ref={asideRef}>
                    {aside}
                  </div>
                ) : null}
              </div>
            </PortalContainerContext.Provider>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
