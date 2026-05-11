import * as React from "react";
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/features/auth/api";
import { PasswordStrength } from "@/features/auth/components/PasswordStrength";
import { registerSchema, type RegisterValues } from "@/features/auth/schemas";
import { useAuthStore } from "@/stores/authStore";

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async ({ confirmPassword, ...values }) => {
    try {
      const res = await authApi.register(values);
      setSession({ accessToken: res.accessToken, user: res.user });
      toast.success("Account created");
      navigate("/overview", { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? "Registration failed";
      toast.error(msg);
    }
  });

  const password = form.watch("password") ?? "";

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Create account</h2>
        <p className="text-base text-muted-foreground">Provision your operator identity.</p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" placeholder="Jane Doe" {...form.register("name")} />
          {form.formState.errors.name ? (
            <div className="text-xs text-destructive">{form.formState.errors.name.message}</div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} />
          {form.formState.errors.email ? (
            <div className="text-xs text-destructive">{form.formState.errors.email.message}</div>
          ) : null}
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
          {form.formState.isSubmitting ? "Creating…" : "Create account"}
        </Button>
      </form>

      <div className="text-xs text-muted-foreground text-center">
        Already have an account? <Link className="text-primary hover:underline" to="/login">Sign in</Link>
      </div>

      <div className="text-xs text-muted-foreground text-center">
        Made by <a className="text-primary hover:underline" href="https://www.akashhalder.in/" target="_blank" rel="noreferrer">Akash Halder Technologia</a>
      </div>
    </div>
  );
}
