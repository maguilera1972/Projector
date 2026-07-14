import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-surface">
      <Sidebar />
      <div className="pl-64">
        {children}
      </div>
    </div>
  );
}
