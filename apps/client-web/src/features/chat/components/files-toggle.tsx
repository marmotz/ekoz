import { Folder } from 'lucide-react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';

export interface FilesToggleProps {
  open: boolean;
  onToggle: () => void;
}

/** Room header button that opens the room's files panel. */
export function FilesToggle({ open, onToggle }: FilesToggleProps) {
  const { t } = useTranslation();

  return (
    <Button type="button" size="sm" variant="outline" aria-expanded={open} onClick={onToggle}>
      <Folder />
      {t('rooms.files.toggle')}
    </Button>
  );
}
