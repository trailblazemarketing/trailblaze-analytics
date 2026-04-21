import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="panel p-8 text-center">
        <h1 className="font-mono text-5xl font-bold text-tb-blue">404</h1>
        <p className="mt-3 text-xs text-tb-muted">
          That route doesn't exist.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-xs text-tb-blue hover:underline"
        >
          ← Home
        </Link>
      </div>
    </main>
  );
}
