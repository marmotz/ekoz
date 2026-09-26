import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useState,
} from 'react';

/**
 * Stand-in for `@/shared/ui/tooltip` in tests: the content shows while the trigger is
 * hovered or focused, without Radix (opening the real tooltip under jsdom takes seconds).
 * Use with `vi.mock('@/shared/ui/tooltip', () => import('<path>/test/tooltip-mock'))`.
 */
const TooltipContext = createContext<{ open: boolean; setOpen: (open: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export const TooltipProvider = ({ children }: { children: ReactNode; delayDuration?: number }) =>
  children;

export function Tooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <TooltipContext.Provider value={{ open, setOpen }}>{children}</TooltipContext.Provider>;
}

export function TooltipTrigger({ children }: { children: ReactNode; asChild?: boolean }) {
  const { setOpen } = useContext(TooltipContext);
  if (!isValidElement(children)) return children;
  const element = children as ReactElement<Record<string, unknown>>;
  return cloneElement(element, {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
  });
}

export function TooltipContent({ children }: { children: ReactNode }) {
  const { open } = useContext(TooltipContext);
  return open ? <div role="tooltip">{children}</div> : null;
}
