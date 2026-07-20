export const PERMISSIONS = {
  PROJECTS_READ: "projects:read",
  PROJECTS_WRITE: "projects:write",
  PROJECTS_DELETE: "projects:delete",
  TASKS_READ: "tasks:read",
  TASKS_WRITE: "tasks:write",
  TASKS_DELETE: "tasks:delete",
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  USERS_DELETE: "users:delete",
  ADMIN_ACCESS: "admin:access",
  SETTINGS_READ: "settings:read",
  SETTINGS_WRITE: "settings:write",
  DOCUMENTS_READ: "documents:read",
  DOCUMENTS_WRITE: "documents:write",
  REPORTS_READ: "reports:read",
  TEAM_READ: "team:read",
  TEAM_WRITE: "team:write",
  PORTFOLIOS_READ: "portfolios:read",
  PORTFOLIOS_WRITE: "portfolios:write",
  PORTFOLIOS_MANAGE: "portfolios:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export type UserRole = "admin" | "user";

export type UserStatus = "active" | "suspended";

export type AvatarDisplay = "initials" | "gravatar";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
  status: UserStatus;
  avatarDisplay: AvatarDisplay;
  createdAt: string;
}

export interface DbUser extends User {
  passwordHash: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
  avatarDisplay: AvatarDisplay;
}

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    avatarDisplay: user.avatarDisplay ?? "initials",
  };
}

export function hasPermission(
  user: Pick<SessionUser, "role" | "permissions">,
  permission: Permission,
): boolean {
  if (user.role === "admin") return true;
  return user.permissions.includes(permission);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrateur",
  user: "Utilisateur",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: "Actif",
  suspended: "Suspendu",
};

export const AVATAR_DISPLAY_LABELS: Record<AvatarDisplay, string> = {
  initials: "Initiales",
  gravatar: "Gravatar",
};

export function isUserActive(user: Pick<User, "status">): boolean {
  return user.status === "active";
}

/** Permissions accordées aux nouveaux comptes « utilisateur ». */
export const DEFAULT_USER_PERMISSIONS: Permission[] = [
  PERMISSIONS.PROJECTS_READ,
  PERMISSIONS.PROJECTS_WRITE,
  PERMISSIONS.TASKS_READ,
  PERMISSIONS.TASKS_WRITE,
  PERMISSIONS.TEAM_READ,
  PERMISSIONS.DOCUMENTS_READ,
  PERMISSIONS.DOCUMENTS_WRITE,
  PERMISSIONS.REPORTS_READ,
  PERMISSIONS.PORTFOLIOS_READ,
  PERMISSIONS.SETTINGS_READ,
];

/** Compte administrateur initial (mot de passe hashé à la création de la base). */
export const INITIAL_ADMIN = {
  email: "michel@aguilera.ch",
  name: "Michel Aguilera",
} as const;
