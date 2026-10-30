import { MetadataRoute } from 'next';
import { locales } from '@/navigation';
import { ALL_USECASE_SLUGS } from '@/config/seo-usecases';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://mastr.audio';
  const routes: MetadataRoute.Sitemap = [];

  // Homepages per locale
  for (const locale of locales) {
    routes.push({
      url: `${baseUrl}/${locale}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    });

    // Programmatic SEO Use-cases
    for (const slug of ALL_USECASE_SLUGS) {
      routes.push({
        url: `${baseUrl}/${locale}/for/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  }

  return routes;
}
