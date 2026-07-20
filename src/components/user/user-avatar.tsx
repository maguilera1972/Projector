"use client";

import { useState } from "react";
import { getInitials, type AvatarDisplay } from "@/lib/auth/permissions";
import { getGravatarUrl } from "@/lib/users/avatar";

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
} as const;

const SIZE_PX = {
  sm: 64,
  md: 80,
  lg: 128,
} as const;

interface UserAvatarProps {
  name: string;
  email: string;
  avatarDisplay?: AvatarDisplay;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
  title?: string;
}

export function UserAvatar({
  name,
  email,
  avatarDisplay = "initials",
  size = "md",
  className = "",
  title,
}: UserAvatarProps) {
  const [gravatarFailed, setGravatarFailed] = useState(false);
  const initials = getInitials(name);
  const sizeClass = SIZE_CLASSES[size];
  const useGravatar = avatarDisplay === "gravatar" && !gravatarFailed;

  if (useGravatar) {
    return (
      <img
        src={getGravatarUrl(email, SIZE_PX[size])}
        alt={name}
        title={title ?? name}
        onError={() => setGravatarFailed(true)}
        className={`rounded-full object-cover ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full gradient-brand font-bold text-white ${sizeClass} ${className}`}
      title={title ?? name}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
