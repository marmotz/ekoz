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
 * Stand-in for `@/shared/ui/popover` in tests: same open/close contract (controlled
 * or not, a trigger that toggles, content mounted only while open), without Radix.
 * Opening the real popover under jsdom takes tens of seconds (`nwsapi` selector
 * matching), so tests of components that merely *use* a popover swap it out with
 * `vi.mock(..., () => import('<path>/test/popover-mock'))`.
 */
interface PopoverState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const PopoverContext = createContext<PopoverState>({ open: false, setOpen: () => {} });

export function Popover({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const setOpen = (next: boolean) => {
    setInner(next);
    onOpenChange?.(next);
  };

  return (
    <PopoverContext.Provider value={{ open: isOpen, setOpen }}>{children}</PopoverContext.Provider>
  );
}

export function PopoverTrigger({ children }: { children: ReactNode; asChild?: boolean }) {
  const { open, setOpen } = useContext(PopoverContext);
  if (!isValidElement(children)) return children;

  const element = children as ReactElement<{ onClick?: (event: MouseEvent) => void }>;
  return cloneElement(element, {
    'aria-expanded': open,
    onClick: (event: MouseEvent) => {
      element.props.onClick?.(event);
      setOpen(!open);
    },
  } as never);
}

export const PopoverAnchor = ({ children }: { children: ReactNode; asChild?: boolean }) => children;

export function PopoverContent({ children }: { children: ReactNode; align?: string }) {
  const { open } = useContext(PopoverContext);
  return open ? <div role="dialog">{children}</div> : null;
}
