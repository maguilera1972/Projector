"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import type { SessionUser } from "@/lib/auth/permissions";

interface AppShellProps {
  children: React.ReactNode;
  user: SessionUser | null;
  showAdministration?: boolean;
}

export function AppShell({
  children,
  user,
  showAdministration = false,
}: AppShellProps) {
  const pathname = usePathname();

  if (pathname === "/login" || pathname.startsWith("/invitation/")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-brand-surface">
      <Sidebar user={user} showAdministration={showAdministration} />
      <div className="pl-64">{children}</div>
    </div>
  );
}
