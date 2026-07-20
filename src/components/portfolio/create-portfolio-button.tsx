"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CreatePortfolioDialog } from "@/components/portfolio/create-portfolio-dialog";
import {
  hasPermission,
  PERMISSIONS,
  type SessionUser,
} from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

interface CreatePortfolioButtonProps {
  user: SessionUser | null;
  variant?: "primary" | "empty";
  label?: string;
  className?: string;
}

export function CreatePortfolioButton({
  user,
  variant = "primary",
  label = "Nouveau portfolio",
  className,
}: CreatePortfolioButtonProps) {
  const [open, setOpen] = useState(false);

  if (!user || !hasPermission(user, PERMISSIONS.PORTFOLIOS_WRITE)) {
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

      <CreatePortfolioDialog
        open={open}
        onClose={() => setOpen(false)}
        defaultOwnerId={user.id}
      />
    </>
  );
}
