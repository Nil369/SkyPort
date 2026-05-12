import { http } from "@/services/api/http";
import type { User } from "@/features/auth/types";

export type UserRow = {
  id: number;
  name: string;
  email: string;
  enabled: boolean;
  roles: string[];
  online: boolean;
  joined_at?: string;
};

export type ActivityItem = {
  id: number;
  created_at: string;
  user_id: number;
  actor_id?: number;
  action: string;
  target?: string;
  detail?: string;
  ip?: string;
};

export type LoginHistoryItem = {
  id: number;
  created_at: string;
  user_id: number;
  success: boolean;
  ip?: string;
  user_agent?: string;
};

export const usersApi = {
  listUsers: async () => (await http.get<{ users: UserRow[] }>("/users")).data.users,
  invite: async (input: { email: string; role: string }) =>
    (await http.post<{ user: UserRow; temporary_password: string; temporary_password_shown_once: boolean }>("/users/invite", input)).data,
  patchUser: async (id: number, input: { enabled?: boolean; role?: string }) =>
    (await http.patch<UserRow>(`/users/${id}`, input)).data,
  deleteUser: async (id: number) => (await http.delete(`/users/${id}`)).data,
  resetPassword: async (id: number, new_password?: string) =>
    (await http.post<{ temporary_password: string; shown_once: boolean }>(`/users/${id}/reset-password`, { new_password })).data,

  meProfile: async () => (await http.get<User>("/users/me")).data,
  patchMe: async (name: string) => (await http.patch<User>("/users/me", { name })).data,
  changePassword: async (current_password: string, new_password: string) =>
    (await http.post("/users/me/password", { current_password, new_password })).data,
  uploadAvatar: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return (await http.post<{ avatar_relative_path: string }>("/users/me/avatar", form, { headers: { "Content-Type": "multipart/form-data" } })).data;
  },

  listActivity: async () => (await http.get<{ items: ActivityItem[] }>("/audit/activity")).data.items,
  listLogins: async () => (await http.get<{ items: LoginHistoryItem[] }>("/audit/logins")).data.items,
};
