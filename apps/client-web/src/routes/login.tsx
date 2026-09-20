import { createFileRoute } from '@tanstack/react-router';

import { useTranslation } from '@/shared/i18n/use-translation';

export const Route = createFileRoute('/login')({
  staticData: { title: 'pages.login.title' },
  component: LoginPage,
});

/** Placeholder: the `auth` feature replaces it. Target of the `RequireAuth` and `session:invalid` redirects. */
function LoginPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h2 className="text-2xl font-bold">{t('pages.login.title')}</h2>
      <p className="text-muted-foreground">{t('pages.login.description')}</p>
    </div>
  );
}
