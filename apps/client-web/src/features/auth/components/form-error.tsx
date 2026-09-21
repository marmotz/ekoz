import type { ReactNode } from 'react';

/** Form-level error message, `null` renders nothing. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;

  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/50 p-3 text-sm text-destructive"
    >
      {children}
    </p>
  );
}
