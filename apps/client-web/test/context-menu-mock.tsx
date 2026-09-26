import {
  cloneElement,
  createContext,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useContext,
  useState,
} from 'react';

/**
 * Stand-in for `@/shared/ui/context-menu` in tests: the content mounts on the
 * `contextmenu` event of the trigger and closes when an item is selected. Opening the
 * real Radix menu under jsdom is slow (`nwsapi` selector matching), so tests of
 * components that merely *use* it swap it out with
 * `vi.mock(..., () => import('<path>/test/context-menu-mock'))`.
 */
const MenuContext = createContext<{ open: boolean; setOpen: (open: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function ContextMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <MenuContext.Provider value={{ open, setOpen }}>{children}</MenuContext.Provider>;
}

export function ContextMenuTrigger({ children }: { children: ReactNode; asChild?: boolean }) {
  const { setOpen } = useContext(MenuContext);
  if (!isValidElement(children)) return children;
  const element = children as ReactElement<{ onContextMenu?: (event: MouseEvent) => void }>;
  return cloneElement(element, {
    onContextMenu: (event: MouseEvent) => {
      element.props.onContextMenu?.(event);
      event.preventDefault();
      setOpen(true);
    },
  });
}

export function ContextMenuContent({ children }: { children: ReactNode }) {
  const { open } = useContext(MenuContext);
  return open ? <div role="menu">{children}</div> : null;
}

export function ContextMenuItem({
  children,
  onSelect,
}: {
  children: ReactNode;
  onSelect?: () => void;
  className?: string;
}) {
  const { setOpen } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.();
        setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

export const ContextMenuSeparator = () => <hr />;
