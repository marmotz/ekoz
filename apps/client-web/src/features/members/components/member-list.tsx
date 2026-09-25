import { useId } from 'react';

import { MemberRow } from '@/features/members/components/member-row';
import type { MemberSection } from '@/features/members/lib/group-members';
import { useTranslation } from '@/shared/i18n/use-translation';

function Section({ section }: { section: MemberSection }) {
  const { t } = useTranslation();
  const headingId = useId();

  return (
    <section aria-labelledby={section.role ? headingId : undefined}>
      {section.role ? (
        <h3
          id={headingId}
          className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t(`members.panel.sections.${section.role}`)} · {section.members.length}
        </h3>
      ) : null}
      <ul>
        {section.members.map((member) => (
          <MemberRow key={member.user.id} member={member} />
        ))}
      </ul>
    </section>
  );
}

/** The members, one list per section (a single unlabelled one in the alphabetical view). */
export function MemberList({ sections }: { sections: readonly MemberSection[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <Section key={section.role ?? 'all'} section={section} />
      ))}
    </div>
  );
}
