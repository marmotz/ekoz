import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';

import { MemberRow } from '@/features/members/components/member-row';
import type { MemberSection } from '@/features/members/lib/group-members';
import { useTranslation } from '@/shared/i18n/use-translation';

/** Stable identity of a section, whatever the view. */
function sectionKey({ group, role }: MemberSection): string {
  if (group) return group === 'none' ? 'group:none' : `group:${group.id}`;
  return role ?? 'all';
}

function Section({
  section,
  collapsed,
  onToggle,
}: {
  section: MemberSection;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const { group } = section;
  const title = section.role
    ? t(`members.panel.sections.${section.role}`)
    : group === 'none'
      ? t('members.panel.sections.noGroup')
      : group
        ? group.name
        : null;
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <section aria-labelledby={title !== null ? headingId : undefined}>
      {title !== null ? (
        <h3
          id={headingId}
          className="pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={onToggle}
            className="flex w-full items-center gap-1 rounded-md px-2 py-0.5 text-left uppercase hover:bg-accent hover:text-accent-foreground focus-visible:outline-2"
          >
            <Chevron className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {title} · {section.members.length}
            </span>
          </button>
        </h3>
      ) : null}
      {collapsed ? null : (
        <ul>
          {section.members.map((member) => (
            <MemberRow key={member.user.id} member={member} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The members, one collapsible list per section (a single unlabelled one in the
 * alphabetical view). `forceOpen` (an active search) shows every section so no
 * match stays hidden, without forgetting what was collapsed.
 */
export function MemberList({
  sections,
  forceOpen = false,
}: {
  sections: readonly MemberSection[];
  forceOpen?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const key = sectionKey(section);
        return (
          <Section
            key={key}
            section={section}
            collapsed={!forceOpen && collapsed.has(key)}
            onToggle={() => toggle(key)}
          />
        );
      })}
    </div>
  );
}
