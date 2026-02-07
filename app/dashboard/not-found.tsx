/**
 * @file app/dashboard/not-found.tsx
 * @description Custom 404 page for dashboard routes.
 * Displays a branded "Page Not Found" message with a link back to the dashboard.
 *
 * @module app/dashboard/not-found
 */

import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4">
      {/* Background gradient effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[100px] animate-pulse"
          style={{
            animationDuration: "8s",
            background:
              "radial-gradient(circle, rgba(100, 116, 139, 0.15) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full blur-[100px] animate-pulse"
          style={{
            animationDuration: "10s",
            animationDelay: "2s",
            background:
              "radial-gradient(circle, rgba(246, 70, 93, 0.08) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* 404 Content */}
      <div className="relative z-10 text-center space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-xl bg-orange/20 flex items-center justify-center border border-orange/30">
            <span className="text-orange font-bold text-3xl">G</span>
          </div>
        </div>

        <h1 className="text-7xl font-bold text-text-tertiary">404</h1>
        <h2 className="text-xl font-semibold text-text-primary">
          Dashboard Page Not Found
        </h2>
        <p className="text-text-secondary max-w-md mx-auto">
          The dashboard page you&apos;re looking for doesn&apos;t exist or has
          been moved.
        </p>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg primary-button-primary text-sm transition-all-fast"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg primary-button-secondary text-sm transition-all-fast"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
