"use client";

/**
 * Global error boundary for the application.
 * This component is rendered when an error occurs at the root layout level.
 * It intentionally does NOT use any providers to avoid context errors during SSR.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0e11",
          color: "#eaecef",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            maxWidth: "500px",
          }}
        >
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: "bold",
              marginBottom: "1rem",
              color: "#f6465d",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              color: "#b7bdc6",
              marginBottom: "2rem",
            }}
          >
            An unexpected error has occurred. Please try again.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#848e9c",
                marginBottom: "1rem",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#64748b",
              color: "white",
              border: "none",
              padding: "0.75rem 1.5rem",
              borderRadius: "0.5rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
