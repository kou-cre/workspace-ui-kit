"use client";

import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function SignOutButton({ action }: { action: () => Promise<void> }) {
  return (
    <DropdownMenuItem
      onSelect={() => {
        action();
      }}
      className="gap-2 text-destructive focus:text-destructive"
    >
      <LogOut className="size-3.5" />
      ログアウト
    </DropdownMenuItem>
  );
}
