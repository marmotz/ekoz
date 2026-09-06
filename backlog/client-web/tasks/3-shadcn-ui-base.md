# Front — shadcn/ui + composants de base

**Statut** : à faire
**Type** : front
**Issue** : [#3](https://github.com/ekoz-chat/client-web/issues/3)

Référence : [../features/web-client-foundations/technical.md §8](../features/web-client-foundations/technical.md#8-shell-applicatif-sidebar--topbar--thème).

## À faire

1. `components.json` : style, base color, `aliases` pointant `src/shared/ui` et
   `src/shared/lib/utils` ; Tailwind 4 (pas de `tailwind.config.js`).
2. `src/shared/lib/utils.ts` : `cn()` (`clsx` + `tailwind-merge`).
3. Copier via `bunx shadcn@latest add` : `button`, `dropdown-menu`, `sheet`,
   `avatar`, `sonner`, `skeleton` dans `src/shared/ui/`.
4. Vérifier que les tokens CSS utilisés par ces composants existent dans
   `src/styles/globals.css` (`:root` + `.dark`) ; compléter sinon.
5. `<Toaster />` (`sonner`) exporté depuis `shared/ui` pour montage ultérieur
   dans `__root.tsx` (T-shell).
6. Les composants copiés sont du code du dépôt : entrée `CHANGELOG.md`, couverts
   par la licence.
7. Test : `Button` rend, `cn()` fusionne les classes conflictuelles.

## Dépendances

- [1-scaffold-tanstack-start](1-scaffold-tanstack-start.md)
