import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const workerUrl = process.env.WORKER_SERVICE_URL || 'http://127.0.0.1:8000';
    return [
      {
        source: '/worker/:path*',
        destination: `${workerUrl}/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
