import { Suspense } from "react";
import { isEntraLoginEnabled } from "@/lib/auth/entra";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-brand-navy-dark">
          <p className="text-slate-400">…</p>
        </div>
      }
    >
      <LoginForm entraEnabled={isEntraLoginEnabled()} />
    </Suspense>
  );
}
