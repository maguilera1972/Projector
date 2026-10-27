import type { Locale } from "@/lib/i18n/config";

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

export type UserRole = "admin" | "user" | "guest";

export const USER_ROLES: UserRole[] = ["user", "guest", "admin"];

export function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "user" || value === "guest";
}

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
  /** Langue préférée (console et e-mails). */
  locale?: Locale;
  /** Envoi des notifications par e-mail (défaut : activé). */
  emailNotifications?: boolean;
  /** Envoi des notifications dans le flux d'activité Teams (défaut : activé si compte Entra lié). */
  teamsNotifications?: boolean;
  /** Compte créé via une invitation. */
  invitedBy?: string;
  /** Identifiant d'objet Microsoft Entra (claim `oid`) si le compte est lié. */
  entraOid?: string;
  /** Origine du compte : local (mot de passe) ou créé via Microsoft Entra. */
  authSource?: "local" | "entra";
  /** Rôle fixé manuellement par un administrateur : prioritaire sur les correspondances Entra. */
  roleOverride?: boolean;
  /** Compte Entra inconnu, en attente d'approbation par un administrateur. */
  pendingApproval?: boolean;
  lastLoginAt?: string;
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
  locale?: Locale;
}

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    avatarDisplay: user.avatarDisplay ?? "initials",
    locale: user.locale,
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
  guest: "Invité externe",
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

/** Permissions accordées par défaut aux invités externes (lecture seule). */
export const DEFAULT_GUEST_PERMISSIONS: Permission[] = [
  PERMISSIONS.PROJECTS_READ,
  PERMISSIONS.TASKS_READ,
  PERMISSIONS.DOCUMENTS_READ,
  PERMISSIONS.TEAM_READ,
];

const ROLE_RANK: Record<UserRole, number> = { guest: 0, user: 1, admin: 2 };

/** Rôle le plus élevé parmi une liste (admin > user > guest). */
export function highestRole(roles: UserRole[]): UserRole | null {
  return roles.reduce<UserRole | null>(
    (best, role) => (best === null || ROLE_RANK[role] > ROLE_RANK[best] ? role : best),
    null,
  );
}

export function defaultPermissionsForRole(role: UserRole): Permission[] {
  if (role === "admin") return [...ALL_PERMISSIONS];
  if (role === "guest") return [...DEFAULT_GUEST_PERMISSIONS];
  return [...DEFAULT_USER_PERMISSIONS];
}

export function sanitizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(ALL_PERMISSIONS);
  return [...new Set(value.filter((item): item is Permission => allowed.has(item)))];
}

/** Compte administrateur initial (créé uniquement si la base est absente). */
export function getInitialAdmin(): { email: string; name: string } {
  return {
    email: process.env.PROJECTOR_ADMIN_EMAIL?.trim() || "admin@example.com",
    name: process.env.PROJECTOR_ADMIN_NAME?.trim() || "Administrateur",
  };
}

