import type { ComponentType } from 'react';

export interface SidebarSectionProps {
  /** Called when the user follows a link in the section (closes the mobile sheet). */
  onNavigate?: () => void;
}

export interface SidebarSection {
  /** Unique key: registering the same id twice keeps the first section. */
  id: string;
  /** Ascending sort key; sections without one go last. */
  order?: number;
  component: ComponentType<SidebarSectionProps>;
}

const sections: SidebarSection[] = [];

/**
 * Features register the components they want in the sidebar from their entry
 * point; the shell renders them, so `shared` never imports a feature.
 */
export function registerSidebarSection(section: SidebarSection): void {
  if (sections.some((existing) => existing.id === section.id)) return;
  sections.push(section);
}

export function getSidebarSections(): readonly SidebarSection[] {
  return [...sections].sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Test helper: empties the registry. */
export function clearSidebarSectionRegistry(): void {
  sections.length = 0;
}
