import type { ComponentType } from 'react';

export interface ProfileCardActionProps {
  userId: string;
}

export interface ProfileCardAction {
  /** Unique key: registering the same id twice keeps the first action. */
  id: string;
  component: ComponentType<ProfileCardActionProps>;
}

const actions: ProfileCardAction[] = [];

/**
 * Features register the actions they want on another user's profile card from their entry
 * point; the card renders them, so `shared` never imports a feature.
 */
export function registerProfileCardAction(action: ProfileCardAction): void {
  if (actions.some((existing) => existing.id === action.id)) return;
  actions.push(action);
}

export function getProfileCardActions(): readonly ProfileCardAction[] {
  return [...actions];
}

/** Test helper: empties the registry. */
export function clearProfileCardActionRegistry(): void {
  actions.length = 0;
}
