import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/features/auth/api";
import { loginSchema, type LoginValues } from "@/features/auth/schemas";
import { useAuthStore } from "@/stores/authStore";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);

  const [showPassword, setShowPassword] = React.useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const from = (location.state as any)?.from as string | undefined;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await authApi.login(values);
      setSession({ accessToken: res.accessToken, user: res.user });
      toast.success("Welcome back");
      navigate(from ?? "/overview", { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? "Login failed";
      toast.error(msg);
    }
  });

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
        <p className="text-base text-muted-foreground">Access your server control surface.</p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} />
          {form.formState.errors.email ? (
            <div className="text-xs text-destructive">{form.formState.errors.email.message}</div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
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
          {form.formState.errors.password ? (
            <div className="text-xs text-destructive">{form.formState.errors.password.message}</div>
          ) : null}
        </div>

        <Button className="w-full hover:bg-blue-600 cursor-pointer hover:text-white" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="text-xs text-muted-foreground">
        Don’t have an account? <Link className="text-primary hover:underline" to="/register">Register</Link>
      </div>
    </div>
  );
}
