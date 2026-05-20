import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
	"relative w-full rounded-xl border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg]:text-foreground",
	{
		variants: {
			variant: {
				default: "bg-background text-foreground",
				destructive: "border-destructive/50 bg-destructive/5 text-destructive dark:border-destructive [&>svg]:text-destructive",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
);

export function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
	return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
	return <h5 className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />;
}
