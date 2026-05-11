import * as React from "react";
import { isRouteErrorResponse, useRouteError, Link } from "react-router";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  notFound?: boolean;
};

export function RouteErrorBoundary({ notFound }: Props) {
  const error = useRouteError();

  const title = notFound
    ? "Not found"
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : "Something went wrong";

  const message = notFound
    ? "This route doesn’t exist."
    : isRouteErrorResponse(error)
      ? typeof error.data === "string"
        ? error.data
        : "The server returned an error response."
      : error instanceof Error
        ? error.message
        : "Unknown error.";

  return (
    <div className="min-h-dvh bg-background text-foreground grid place-items-center p-6">
      <Card className="w-full max-w-md p-6">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">SkyPort</div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
