import * as React from "react";
import { siGithub } from 'simple-icons';
import { Button } from "@/components/ui/button";

type ConnectGitHubButtonProps = React.ComponentProps<typeof Button>;

export function ConnectGitHubButton({ children, onClick, ...props }: ConnectGitHubButtonProps) {
    return (
        <Button
            {...props}
            onClick={(event) => {
                onClick?.(event);
                if (event.defaultPrevented) return;
                window.location.href = `https://skyport.akashhalder.in/api/github/connect?instance=${encodeURIComponent(window.location.origin)}`;
            }}
        >
            <svg
                role="img"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                className="mr-2 size-4 fill-white" // Change fill-current to fill-white
            >
                <title>{siGithub.title}</title>
                <path d={siGithub.path} />
            </svg>
            
            {children ?? "Connect GitHub"}
        </Button>
    );
}