// A modal surface (Dialog, the item overlay) provides its popup element here so that every Popover,
// Menu and Select opened inside it portals into that element instead of <body>. That keeps the
// floating layer inside the modal's stacking context (the --z-modal rung), exactly as the design
// system's anchored popovers behaved, and lets Base UI's nested Escape handling work unchanged.
import { createContext, useContext } from "react";

export const PortalContainerContext = createContext<HTMLElement | null>(null);

/** The element floating layers should portal into (null = document.body). */
export const usePortalContainer = () => useContext(PortalContainerContext);
