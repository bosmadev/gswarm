import SharedLayout from "./shared";

export default function Home() {
  return (
    <SharedLayout>
      <div className="space-y-6">
        {/* Welcome Card */}
        <div className="primary-card p-8">
          <h1 className="mb-4 text-3xl font-bold text-text-primary">
            Welcome to Next.js Template
          </h1>
          <p className="mb-6 text-text-secondary text-lg">
            A modern, production-ready Next.js 16+ template with Biome, Knip,
            Vitest, and Tailwind CSS v4.
          </p>
          <div className="flex gap-4">
            <a
              href="https://nextjs.org/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="primary-button-primary rounded-md px-4 py-2 transition-all-fast"
            >
              Documentation
            </a>
            <a
              href="/readme"
              className="primary-button-secondary rounded-md px-4 py-2 transition-all-fast"
            >
              View README
            </a>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            title="Next.js 16+"
            description="Latest Next.js with Turbopack for lightning-fast development builds."
            icon="N"
          />
          <FeatureCard
            title="Tailwind CSS v4"
            description="Modern CSS framework with @theme design tokens and utility-first approach."
            icon="T"
          />
          <FeatureCard
            title="TypeScript 5.9+"
            description="Full type safety with strict compiler settings and modern features."
            icon="TS"
          />
          <FeatureCard
            title="Biome"
            description="Fast linting and formatting with Rust-based tooling."
            icon="B"
          />
          <FeatureCard
            title="Knip"
            description="Dead-code detection to keep your codebase clean."
            icon="K"
          />
          <FeatureCard
            title="Vitest"
            description="Fast unit testing with a modern API and instant feedback."
            icon="V"
          />
        </div>
      </div>
    </SharedLayout>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="primary-card primary-card-hover p-6 transition-all-fast">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-brand/20 flex items-center justify-center">
          <span className="text-brand font-bold text-sm">{icon}</span>
        </div>
        <h3 className="font-semibold text-text-primary">{title}</h3>
      </div>
      <p className="text-text-secondary text-sm">{description}</p>
    </div>
  );
}
