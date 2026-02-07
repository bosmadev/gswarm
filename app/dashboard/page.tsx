/**
 * @file app/dashboard/page.tsx
 * @description Main dashboard page with authentication and tabbed interface.
 * Server component that checks auth, then renders client components for the UI.
 *
 * @module app/dashboard/page
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SharedLayout from "@/app/shared";
import { DashboardShell } from "./components/dashboard-shell";
import { DashboardTabs } from "./components/dashboard-tabs";

/**
 * DashboardPage - Server component with auth guard.
 * Checks for admin_session cookie and redirects to login if not authenticated.
 */
export default async function DashboardPage() {
  // Check for authentication
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session");

  // Redirect to login if no valid session
  if (!sessionCookie?.value) {
    redirect("/dashboard/login");
  }

  return (
    <SharedLayout>
      <DashboardShell>
        <DashboardTabs />
      </DashboardShell>
    </SharedLayout>
  );
}
