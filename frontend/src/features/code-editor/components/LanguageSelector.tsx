import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { LANGUAGE_REGISTRY, getLanguageById, getLanguageSearchText, type LanguageDefinition } from "@/features/code-editor/languages/languageRegistry";
import { BrandLanguageIcon, getLanguageBrandColor } from "@/features/code-editor/components/BrandLanguageIcon";

function getAccentColor(iconSlug: string): string {
  return getLanguageBrandColor(iconSlug);
}

function LanguageIcon({ language, className }: { language: LanguageDefinition; className?: string }) {
  return <BrandLanguageIcon iconSlug={language.iconSlug} className={className} title={language.label} />;
}

interface LanguageSelectorProps {
  value: string;
  onChange: (nextId: string) => void;
  className?: string;
}

export function LanguageSelector({ value, onChange, className }: LanguageSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const activeLanguage = React.useMemo(() => getLanguageById(value), [value]);

  const activeColor = getAccentColor(activeLanguage.iconSlug);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className="cursor-pointer inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium"
        style={{
          color: activeColor,
          backgroundColor: `${activeColor}1A`,
        }}
        aria-label={`Active language: ${activeLanguage.label}`}
      >
        <LanguageIcon language={activeLanguage} className="size-3.5" />
        {activeLanguage.label}
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="h-8 w-70 justify-between text-xs">
            <span className="truncate cursor-pointer">{activeLanguage.label}</span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-90 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search 100+ language modes..." />
            <CommandList>
              <CommandEmpty>No language found.</CommandEmpty>
              <LanguageItems
                query={query}
                activeLanguageId={activeLanguage.id}
                onSelect={(id) => {
                  onChange(id);
                  setQuery("");
                  setOpen(false);
                }}
              />
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LanguageItems({
  query,
  activeLanguageId,
  onSelect,
}: {
  query: string;
  activeLanguageId: string;
  onSelect: (id: string) => void;
}) {
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANGUAGE_REGISTRY;
    return LANGUAGE_REGISTRY.filter((language) => getLanguageSearchText(language).includes(q));
  }, [query]);

  return (
    <>
      <CommandGroup heading="Language Modes">
        {filtered.map((language) => (
          <CommandItem key={language.id} value={language.id} onSelect={() => onSelect(language.id)}>
            <LanguageIcon language={language} className="size-4 cursor-pointer" />
            <span className="flex-1 truncate cursor-pointer">{language.label}</span>
            <span className="text-[10px] text-muted-foreground cursor-pointer">{language.id}</span>
            <Check className={cn("ml-1 size-4", activeLanguageId === language.id ? "opacity-100" : "opacity-0")} />
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}
