import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

type PasswordStrengthProps = {
  password: string;
};

type PasswordRule = {
  label: string;
  passed: boolean;
};

function getPasswordRules(password: string): PasswordRule[] {
  return [
    { label: "At least 8 characters", passed: password.length >= 8 },
    { label: "One uppercase letter (A-Z)", passed: /[A-Z]/.test(password) },
    { label: "One number (0-9)", passed: /[0-9]/.test(password) },
    { label: "One symbol (@, #, &, *)", passed: /[@#&*]/.test(password) },
  ];
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const rules = getPasswordRules(password);
  const passedCount = rules.filter((rule) => rule.passed).length;
  const strength = Math.round((passedCount / rules.length) * 100);

  const strengthLabel =
    passedCount === rules.length ? "Strong" : passedCount >= 2 ? "Medium" : password.length > 0 ? "Weak" : "Enter password";

  const toneClass =
    passedCount === rules.length
      ? "text-emerald-600 dark:text-emerald-400"
      : passedCount >= 2
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Password strength</span>
        <span className={cn("font-medium transition-colors", toneClass)}>{strengthLabel}</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            passedCount === rules.length ? "bg-emerald-500" : passedCount >= 2 ? "bg-amber-500" : "bg-primary/60",
          )}
          style={{ width: `${strength}%` }}
        />
      </div>

      <div className="grid gap-1 text-xs">
        {rules.map((rule) => (
          <div
            key={rule.label}
            className={cn(
              "flex items-center gap-2 transition-all duration-200",
              rule.passed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}
          >
            {rule.passed ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            <span>{rule.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
