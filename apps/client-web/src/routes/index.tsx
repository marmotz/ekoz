import { createFileRoute } from '@tanstack/react-router';

import { useTranslation } from '@/shared/i18n/use-translation';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{t('pages.home.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('pages.home.description')}</p>
    </main>
  );
}
