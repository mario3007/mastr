import Link from 'next/link';

export default function RootNotFound() {
  return (
    <html lang="en" className="dark">
      <body className="bg-studio-950 text-white min-h-screen flex items-center justify-center p-6 font-mono text-center">
        <div>
          <h1 className="text-4xl font-bold text-accent-cyan mb-2">404</h1>
          <p className="text-sm text-studio-400 mb-6">Page Not Found</p>
          <Link
            href="/de"
            className="rounded-xl bg-studio-800 px-4 py-2 text-xs font-semibold text-white hover:bg-studio-700 transition"
          >
            Zurück zum Studio
          </Link>
        </div>
      </body>
    </html>
  );
}
