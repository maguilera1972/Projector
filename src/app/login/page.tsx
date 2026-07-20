import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-brand-navy-dark">
          <p className="text-slate-400">Chargement...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
