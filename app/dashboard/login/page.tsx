/**
 * @file app/dashboard/login/page.tsx
 * @description Login page for the admin dashboard.
 * Client component with form for username and password authentication.
 *
 * @module app/dashboard/login/page
 */

"use client";

import { Lock, LogIn, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * LoginPage component for admin dashboard authentication.
 * Displays a centered card with username/password form.
 */
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage =
          data.error === "Unauthorized"
            ? "Invalid username or password"
            : data.error || "Login failed. Please check your credentials.";
        setError(errorMessage);
        return;
      }

      // Success - redirect to dashboard
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4">
      {/* Background gradient effects */}
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden z-0"
        aria-hidden="true"
      >
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[100px] animate-pulse motion-reduce:animate-none"
          style={{
            animationDuration: "8s",
            background:
              "radial-gradient(circle, rgba(100, 116, 139, 0.15) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full blur-[100px] animate-pulse motion-reduce:animate-none"
          style={{
            animationDuration: "10s",
            animationDelay: "2s",
            background:
              "radial-gradient(circle, rgba(249, 115, 22, 0.1) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Login Card */}
      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="text-center space-y-2">
          {/* Logo */}
          <div className="flex justify-center mb-2">
            <div
              className="w-14 h-14 rounded-xl bg-orange/20 flex items-center justify-center border border-orange/30"
              role="img"
              aria-label="GSwarm logo"
            >
              <span
                className="text-orange font-bold text-2xl"
                aria-hidden="true"
              >
                G
              </span>
            </div>
          </div>
          <CardTitle id="login-heading" className="text-2xl">
            GSwarm Dashboard
          </CardTitle>
          <CardDescription>
            Sign in to access the admin dashboard
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-labelledby="login-heading"
          >
            {/* Error Message */}
            {error && (
              <div
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}

            {/* Username Field */}
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="text-sm font-medium text-text-secondary flex items-center gap-2"
              >
                <User className="w-4 h-4" aria-hidden="true" />
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoComplete="username"
                autoFocus
                disabled={isLoading}
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-sm font-medium text-text-secondary flex items-center gap-2"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                disabled={isLoading}
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isLoading}
              disabled={isLoading || !username || !password}
            >
              {!isLoading && <LogIn className="w-4 h-4" aria-hidden="true" />}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
