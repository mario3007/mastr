import { createSharedPathnamesNavigation } from 'next-intl/navigation';

export const locales = ['de', 'en', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'de';

export const { Link, redirect, usePathname, useRouter } = createSharedPathnamesNavigation({
  locales,
});
