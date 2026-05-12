import * as React from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { authApi } from "@/features/auth/api";
import { PasswordStrength } from "@/features/auth/components/PasswordStrength";
import { registerSchema, type RegisterValues } from "@/features/auth/schemas";
import { useAuthStore } from "@/stores/authStore";

export function SetupWizardPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [role, setRole] = React.useState<"owner" | "admin">("admin");

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async ({ confirmPassword, ...values }) => {
    try {
      const res = await authApi.register({ ...values, role });
      setSession({ accessToken: res.accessToken, user: res.user });
      toast.success("Admin created");
      navigate("/overview", { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? "Setup failed";
      toast.error(msg);
    }
  });

  const password = form.watch("password") ?? "";

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">First-time setup</div>
        <h2 className="text-2xl font-semibold tracking-tight">Create administrator</h2>
        <p className="text-base text-muted-foreground">This account will own the SkyPort server.</p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" placeholder="Admin" {...form.register("name")} />
          {form.formState.errors.name ? (
            <div className="text-xs text-destructive">{form.formState.errors.name.message}</div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" autoComplete="email" placeholder="admin@example.com" {...form.register("email")} />
          {form.formState.errors.email ? (
            <div className="text-xs text-destructive">{form.formState.errors.email.message}</div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as "owner" | "admin")}
          >
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="pr-10"
                {...form.register("password")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <PasswordStrength password={password} />
            {form.formState.errors.password ? (
              <div className="text-xs text-destructive">{form.formState.errors.password.message}</div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                className="pr-10"
                {...form.register("confirmPassword")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            {form.formState.errors.confirmPassword ? (
              <div className="text-xs text-destructive">{form.formState.errors.confirmPassword.message}</div>
            ) : null}
          </div>
        </div>

        <Button className="w-full hover:bg-blue-600 cursor-pointer hover:text-white" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Provisioning…" : "Create admin"}
        </Button>
      </form>

      <div className="text-xs text-muted-foreground text-center">
        Setup is safe to rerun if no users exist.
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { t: "Realtime", d: "WebSocket metrics + terminals" },
          { t: "Single binary", d: "SQLite + embedded UI" },
          { t: "RBAC", d: "Owner / admin / dev / viewer" },
        ].map((x) => (
          <Card key={x.t} className="border-border/70 bg-muted/20 p-3 text-left shadow-none">
            <div className="font-mono text-[11px] font-semibold text-primary">{x.t}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{x.d}</div>
          </Card>
        ))}
      </div>

      <div className="text-xs text-muted-foreground text-center">
        Made by <a className="text-primary hover:underline" href="https://www.akashhalder.in/" target="_blank" rel="noreferrer">Akash Halder Technologia</a>
      </div>
    </div>
  );
}
