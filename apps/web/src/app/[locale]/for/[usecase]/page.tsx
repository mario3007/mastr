import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/navigation';
import { SEO_USECASES, ALL_USECASE_SLUGS } from '@/config/seo-usecases';
import { StudioWorkspaceWrapper } from '@/components/studio/StudioWorkspaceWrapper';
import { CheckCircle, AlertTriangle, HelpCircle, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';

interface Props {
  params: {
    locale: string;
    usecase: string;
  };
}

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    ALL_USECASE_SLUGS.map((usecase) => ({
      locale,
      usecase,
    }))
  );
}

export async function generateMetadata({ params: { locale, usecase } }: Props): Promise<Metadata> {
  if (!SEO_USECASES[usecase]) return {};

  const t = await getTranslations({ locale, namespace: `seo.usecases.${usecase}` });
  const tSeo = await getTranslations({ locale, namespace: 'seo' });

  return {
    title: t('title'),
    description: t('description'),
    keywords: tSeo('keywords'),
    alternates: {
      canonical: `/${locale}/for/${usecase}`,
      languages: {
        de: `/de/for/${usecase}`,
        en: `/en/for/${usecase}`,
        es: `/es/for/${usecase}`,
      },
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      type: 'website',
    },
  };
}

export default async function UseCasePage({ params: { locale, usecase } }: Props) {
  setRequestLocale(locale);
  const config = SEO_USECASES[usecase];
  if (!config) notFound();

  const t = await getTranslations({ locale, namespace: `seo.usecases.${usecase}` });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  // Schema.org SoftwareApplication JSON-LD
  const schemaApp = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `MASTR - ${t('h1')}`,
    operatingSystem: 'Any (Web Cloud)',
    applicationCategory: config.applicationCategory,
    description: t('description'),
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'EUR',
    },
  };

  // Schema.org FAQPage JSON-LD
  const schemaFaq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: t('faq1Q'),
        acceptedAnswer: {
          '@type': 'Answer',
          text: t('faq1A'),
        },
      },
      {
        '@type': 'Question',
        name: t('faq2Q'),
        acceptedAnswer: {
          '@type': 'Answer',
          text: t('faq2A'),
        },
      },
    ],
  };

  return (
    <div className="relative isolate px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      {/* Schema.org Injections */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaFaq) }}
      />

      <div className="mx-auto max-w-5xl text-center mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-1 text-xs font-medium text-accent-cyan mb-4">
          <Sparkles className="h-3.5 w-3.5" />
          <span>{config.category}</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
          {t('h1')}
        </h1>
        <p className="text-sm md:text-base text-studio-400 max-w-2xl mx-auto leading-relaxed">
          {t('intro')}
        </p>
      </div>

      {/* Embedded Interactive Studio Workspace */}
      <div className="mx-auto max-w-5xl mb-20">
        <StudioWorkspaceWrapper />
      </div>

      {/* Problem vs Solution Deep Dive Grid */}
      <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
        {/* The Problem */}
        <div className="rounded-2xl border border-red-900/40 bg-studio-900/70 p-6 md:p-8 backdrop-blur">
          <div className="flex items-center gap-3 mb-4 text-red-400">
            <AlertTriangle className="h-6 w-6" />
            <h2 className="text-lg font-bold text-white">{t('problemTitle')}</h2>
          </div>
          <p className="text-sm text-studio-300 leading-relaxed">
            {t('problemDesc')}
          </p>
        </div>

        {/* The Solution */}
        <div className="rounded-2xl border border-accent-cyan/40 bg-studio-900/70 p-6 md:p-8 backdrop-blur">
          <div className="flex items-center gap-3 mb-4 text-accent-cyan">
            <CheckCircle className="h-6 w-6" />
            <h2 className="text-lg font-bold text-white">{t('solutionTitle')}</h2>
          </div>
          <p className="text-sm text-studio-300 leading-relaxed">
            {t('solutionDesc')}
          </p>
        </div>
      </div>

      {/* FAQ Accordion Section */}
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-center gap-2 mb-8">
          <HelpCircle className="h-5 w-5 text-accent-cyan" />
          <h2 className="text-xl md:text-2xl font-bold text-white">FAQ</h2>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-studio-800 bg-studio-900/60 p-5">
            <h3 className="text-sm md:text-base font-semibold text-white mb-2">
              {t('faq1Q')}
            </h3>
            <p className="text-xs md:text-sm text-studio-400 leading-relaxed">
              {t('faq1A')}
            </p>
          </div>

          <div className="rounded-xl border border-studio-800 bg-studio-900/60 p-5">
            <h3 className="text-sm md:text-base font-semibold text-white mb-2">
              {t('faq2Q')}
            </h3>
            <p className="text-xs md:text-sm text-studio-400 leading-relaxed">
              {t('faq2A')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
