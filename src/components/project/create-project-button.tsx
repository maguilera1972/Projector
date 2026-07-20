"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import {
  hasPermission,
  PERMISSIONS,
  type SessionUser,
} from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

interface CreateProjectButtonProps {
  user: SessionUser | null;
  variant?: "primary" | "empty";
  label?: string;
  className?: string;
  defaultPortfolioId?: string;
}

export function CreateProjectButton({
  user,
  variant = "primary",
  label = "Nouveau projet",
  className,
  defaultPortfolioId,
}: CreateProjectButtonProps) {
  const [open, setOpen] = useState(false);

  if (!user || !hasPermission(user, PERMISSIONS.PROJECTS_WRITE)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          variant === "primary"
            ? "gradient-brand flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white shadow-md transition-opacity hover:opacity-90"
            : "gradient-brand mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white",
          className,
        )}
      >
        <Plus className="h-4 w-4" />
        {label}
      </button>

      <CreateProjectDialog
        open={open}
        onClose={() => setOpen(false)}
        defaultChefDeProjetId={user.id}
        defaultPortfolioId={defaultPortfolioId}
      />
    </>
  );
}
