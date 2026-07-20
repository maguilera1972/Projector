"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { UserAvatar } from "@/components/user/user-avatar";
import type { User } from "@/lib/auth/permissions";
import {
  SKILL_LEVEL_LABELS,
  type ResourceGroup,
  type ResourceProfile,
  type SkillLevel,
  type UserSkill,
} from "@/types";

interface TeamViewProps {
  users: User[];
  groups: ResourceGroup[];
  skills: UserSkill[];
  profiles: ResourceProfile[];
  canEdit: boolean;
}

const skillLevels: SkillLevel[] = [
  "debutant",
  "intermediaire",
  "confirme",
  "expert",
];

export function TeamView({
  users,
  groups: initialGroups,
  skills: initialSkills,
  profiles: initialProfiles,
  canEdit,
}: TeamViewProps) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [skills, setSkills] = useState(initialSkills);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "" });

  function getSkillLevel(userId: string, groupId: string): SkillLevel | "" {
    return skills.find(
      (skill) => skill.userId === userId && skill.groupId === groupId,
    )?.level ?? "";
  }

  function getProfile(userId: string): ResourceProfile | undefined {
    return profiles.find((profile) => profile.userId === userId);
  }

  async function refreshPage() {
    router.refresh();
  }

  async function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!newGroup.name.trim()) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/resource-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newGroup),
      });

      const data = (await response.json()) as {
        error?: string;
        group?: ResourceGroup;
      };

      if (!response.ok) {
        setError(data.error ?? "Création impossible.");
        return;
      }

      if (data.group) {
        setGroups((current) =>
          [...current, data.group!].sort((a, b) =>
            a.name.localeCompare(b.name, "fr"),
          ),
        );
      }

      setNewGroup({ name: "", description: "" });
      await refreshPage();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm("Supprimer ce groupe de compétences ?")) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/resource-groups/${groupId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Suppression impossible.");
        return;
      }

      setGroups((current) => current.filter((group) => group.id !== groupId));
      setSkills((current) =>
        current.filter((skill) => skill.groupId !== groupId),
      );
      await refreshPage();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSkillChange(
    userId: string,
    groupId: string,
    level: SkillLevel | "",
  ) {
    setLoading(true);
    setError("");

    try {
      if (level === "") {
        await fetch("/api/resource-skills", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, groupId }),
        });
        setSkills((current) =>
          current.filter(
            (skill) => !(skill.userId === userId && skill.groupId === groupId),
          ),
        );
      } else {
        const response = await fetch("/api/resource-skills", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, groupId, level }),
        });

        const data = (await response.json()) as {
          error?: string;
          skill?: UserSkill;
        };

        if (!response.ok) {
          setError(data.error ?? "Mise à jour impossible.");
          return;
        }

        if (data.skill) {
          setSkills((current) => {
            const filtered = current.filter(
              (skill) =>
                !(skill.userId === userId && skill.groupId === groupId),
            );
            return [...filtered, data.skill!];
          });
        }
      }

      await refreshPage();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCapacityChange(userId: string, capacity: number) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/users/${userId}/resource-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyCapacityPercent: capacity }),
      });

      const data = (await response.json()) as {
        error?: string;
        profile?: ResourceProfile;
      };

      if (!response.ok) {
        setError(data.error ?? "Mise à jour impossible.");
        return;
      }

      if (data.profile) {
        setProfiles((current) => {
          const filtered = current.filter(
            (profile) => profile.userId !== userId,
          );
          return [...filtered, data.profile!];
        });
      }

      await refreshPage();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Personnes ({users.length})
        </h2>
        <p className="mt-1 text-sm text-brand-muted">
          Utilisateurs actifs et disponibilité hebdomadaire (%).
        </p>
        <ul className="mt-4 divide-y divide-slate-100">
          {users.map((user) => {
            const profile = getProfile(user.id);
            const capacity = profile?.weeklyCapacityPercent ?? 100;

            return (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={user.name}
                    email={user.email}
                    avatarDisplay={user.avatarDisplay}
                    size="sm"
                  />
                  <div>
                    <p className="font-medium text-slate-900">{user.name}</p>
                    <p className="text-sm text-brand-muted">{user.email}</p>
                  </div>
                </div>
                <div className="min-w-[12rem]">
                  <label className="mb-1 block text-xs font-medium text-brand-muted">
                    Disponibilité ({capacity}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={capacity}
                    disabled={!canEdit || loading}
                    onChange={(e) =>
                      void handleCapacityChange(
                        user.id,
                        Number(e.target.value),
                      )
                    }
                    className="w-full disabled:opacity-50"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Groupes de compétences ({groups.length})
        </h2>
        <p className="mt-1 text-sm text-brand-muted">
          Corps de métier IT, gestion de projet, métier utilisateur, etc.
        </p>

        {groups.length === 0 ? (
          <p className="mt-4 text-sm text-brand-muted">
            Aucun groupe défini. Créez le premier groupe ci-dessous.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {groups.map((group) => (
              <li
                key={group.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">{group.name}</p>
                  {group.description && (
                    <p className="mt-1 text-sm text-brand-muted">
                      {group.description}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteGroup(group.id)}
                    disabled={loading}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Supprimer ${group.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form
            onSubmit={handleCreateGroup}
            className="mt-6 grid gap-3 border-t border-slate-100 pt-6 sm:grid-cols-2"
          >
            <input
              required
              value={newGroup.name}
              onChange={(e) =>
                setNewGroup({ ...newGroup, name: e.target.value })
              }
              placeholder="Nom du groupe (ex. Développement IT)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              value={newGroup.description}
              onChange={(e) =>
                setNewGroup({ ...newGroup, description: e.target.value })
              }
              placeholder="Description (optionnel)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
            />
            <button
              type="submit"
              disabled={loading}
              className="gradient-brand inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2 sm:justify-self-end"
            >
              <Plus className="h-4 w-4" />
              Ajouter un groupe
            </button>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Matrice de compétences
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            Niveau de compétence par personne et par groupe.
          </p>
        </div>

        {groups.length === 0 ? (
          <p className="p-6 text-sm text-brand-muted">
            Créez des groupes de compétences pour afficher la matrice.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    Personne
                  </th>
                  {groups.map((group) => (
                    <th
                      key={group.id}
                      className="px-4 py-3 font-semibold text-slate-700"
                    >
                      {group.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {user.name}
                    </td>
                    {groups.map((group) => (
                      <td key={group.id} className="px-4 py-3">
                        <select
                          value={getSkillLevel(user.id, group.id)}
                          disabled={!canEdit || loading}
                          onChange={(e) =>
                            void handleSkillChange(
                              user.id,
                              group.id,
                              e.target.value as SkillLevel | "",
                            )
                          }
                          className="w-full min-w-[8rem] rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:opacity-50"
                        >
                          <option value="">—</option>
                          {skillLevels.map((level) => (
                            <option key={level} value={level}>
                              {SKILL_LEVEL_LABELS[level]}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
