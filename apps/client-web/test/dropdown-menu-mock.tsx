import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

/**
 * Stand-in for `@/shared/ui/dropdown-menu` in tests: it always renders its items.
 * Opening the real Radix menu under jsdom takes several seconds per interaction
 * (`nwsapi` selector matching), so unit tests of components that merely *use* a
 * menu swap it out with `vi.mock(..., () => import('<path>/test/dropdown-menu-mock'))`.
 */
export const DropdownMenu = ({ children }: { children: ReactNode }) => <div>{children}</div>;
export const DropdownMenuTrigger = ({ children }: { children: ReactNode }) => children;
export const DropdownMenuContent = ({ children }: { children: ReactNode }) => (
  <div role="menu">{children}</div>
);
export const DropdownMenuItem = ({
  children,
  onSelect,
  asChild,
}: {
  children: ReactNode;
  onSelect?: () => void;
  asChild?: boolean;
}) =>
  asChild && isValidElement(children) ? (
    cloneElement(children as ReactElement<{ role?: string }>, { role: 'menuitem' })
  ) : (
    <button type="button" role="menuitem" onClick={() => onSelect?.()}>
      {children}
    </button>
  );
export const DropdownMenuLabel = ({ children }: { children: ReactNode }) => <div>{children}</div>;
export const DropdownMenuSeparator = () => <hr />;
