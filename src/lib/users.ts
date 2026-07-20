import type { User } from "@/lib/auth/permissions";

export interface AssigneeOption {
  id: string;
  name: string;
  email: string;
}

export function toAssigneeOptions(users: User[]): AssigneeOption[] {
  return users
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function getUserNameById(
  userId: string | undefined,
  users: Pick<User, "id" | "name">[],
): string | null {
  if (!userId) return null;
  return users.find((user) => user.id === userId)?.name ?? null;
}
