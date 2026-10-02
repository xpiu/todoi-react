import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const ToastHostContext = createContext<((host: HTMLElement) => () => void) | null>(null);

/** Keep the one app toast inside the active modal's focus and accessibility boundary. */
export function ToastPortalProvider({ children, toast }: { children: ReactNode; toast: ReactNode }) {
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  const register = useCallback((host: HTMLElement) => {
    setHosts((current) => [...current, host]);
    return () => setHosts((current) => current.filter((element) => element !== host));
  }, []);
  return (
    <ToastHostContext.Provider value={register}>
      {children}
      {toast ? createPortal(toast, hosts.at(-1) ?? document.body) : null}
    </ToastHostContext.Provider>
  );
}

/** Modal shells register their existing popup; nested dialogs temporarily own the toast. */
export function useToastHost(host: HTMLElement | null) {
  const register = useContext(ToastHostContext);
  useLayoutEffect(() => host && register ? register(host) : undefined, [host, register]);
}
