import type { ParseKeys } from 'i18next';

import { conversationErrorKey } from '@/features/direct-messages/api/errors';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  /** Shown in emphasis under the message, e.g. that the group will be deleted for everyone. */
  warning?: string | undefined;
  confirmLabel: ParseKeys;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
}

/** A confirmation before a destructive action, with the failure of the action inline. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  warning,
  confirmLabel,
  pending,
  error,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        {warning && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {warning}
          </p>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {t(conversationErrorKey(error))}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('directMessages.confirm.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {t(confirmLabel)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
