import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, X } from "lucide-react";

export type NavItem<T extends string> = {
  id: T;
  label: string;
  icon: ReactNode;
};

type SidebarNavProps<T extends string> = {
  items: NavItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  title: string;
  subtitle?: string;
  brandIcon: ReactNode;
  email?: string | null;
  roleBadge?: string;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

function NavList<T extends string>({
  items,
  active,
  onSelect,
}: {
  items: NavItem<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {item.icon}
                </span>
                <span className="truncate text-left">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarFooter({
  email,
  roleBadge,
  onSignOut,
}: {
  email?: string | null;
  roleBadge?: string;
  onSignOut: () => void;
}) {
  return (
    <div className="shrink-0 border-t p-3">
      {email && (
        <div className="mb-2 rounded-xl bg-muted/60 px-3 py-2">
          <p className="truncate text-xs font-medium text-foreground">{email}</p>
          {roleBadge && (
            <span className="mt-1 inline-flex items-center rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
              {roleBadge}
            </span>
          )}
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onSignOut}
        className="flex w-full items-center justify-start gap-2"
        title="Terminar Sessão"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        Terminar sessão
      </Button>
    </div>
  );
}

export default function SidebarNav<T extends string>({
  items,
  active,
  onSelect,
  title,
  subtitle,
  brandIcon,
  email,
  roleBadge,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}: SidebarNavProps<T>) {
  const brand = (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        {brandIcon}
      </div>
      <div className="min-w-0">
        <p className="truncate font-bold leading-tight text-foreground">{title}</p>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: fixed left sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card lg:flex">
        {brand}
        <NavList items={items} active={active} onSelect={onSelect} />
        <SidebarFooter email={email} roleBadge={roleBadge} onSignOut={onSignOut} />
      </aside>

      {/* Mobile: slide-in drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r bg-card shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b pr-2">
              <div className="min-w-0 flex-1">{brand}</div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onCloseMobile}
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <NavList
              items={items}
              active={active}
              onSelect={(id) => {
                onSelect(id);
                onCloseMobile();
              }}
            />
            <SidebarFooter
              email={email}
              roleBadge={roleBadge}
              onSignOut={onSignOut}
            />
          </aside>
        </div>
      )}
    </>
  );
}
