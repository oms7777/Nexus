"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@workspace/ui/components/command";
import { Badge } from "@workspace/ui/components/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

export type MultiSelectOption = {
  label: string;
  value: string;
};

export function MultiSelect({
  options,
  value,
  onValueChange,
  placeholder,
  className,
}: {
  options: MultiSelectOption[];
  value: string[];
  onValueChange: (val: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (val: string) => {
    if (value.includes(val)) {
      onValueChange(value.filter((v) => v !== val));
    } else {
      onValueChange([...value, val]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-[220px] justify-between", className)}
        >
          {value.length === 0 ? (
            placeholder || "Select"
          ) : (
            <span className="flex flex-wrap gap-1">
              {options
                .filter((opt) => value.includes(opt.value))
                .map((opt) => (
                  <Badge key={opt.value} variant="secondary">
                    {opt.label}
                  </Badge>
                ))}
            </span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>

      </PopoverTrigger>

      <PopoverContent className="w-[220px] p-0">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandEmpty>No item found.</CommandEmpty>
          <CommandGroup>
            {options.map((opt) => (
              <CommandItem
                key={opt.value}
                onSelect={() => handleSelect(opt.value)}
              >
                <div
                  className={cn(
                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                    value.includes(opt.value)
                      ? "bg-primary text-primary-foreground"
                      : "opacity-50"
                  )}
                >
                  {value.includes(opt.value) && <Check className="h-3 w-3" />}
                </div>
                {opt.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {value.length > 0 && (
            <div className="border-t p-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onValueChange([])}
              >
                Clear
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
