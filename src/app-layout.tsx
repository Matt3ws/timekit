import { useEffect } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, Users, FileText, Repeat, BookOpenCheck, Settings, Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { TimerBar } from "@/components/timer-bar";
import { LiveDuration } from "@/components/live-duration";
import { useTheme, type Theme } from "@/lib/theme";
import { formatDuration } from "@/lib/duration";
import { useActiveTimer } from "@/queries/use-time-entries";
import { useTrackedTotals } from "@/queries/use-stats";
import { autoBackupIfDue } from "@/queries/use-bookkeeping";
import { remindDueSubscriptions } from "@/queries/use-subscriptions";
import { useSyncOnFocus } from "@/queries/use-sync";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { to: "/bookkeeping", label: "Bookkeeping", icon: BookOpenCheck },
];

const isActivePath = (pathname: string, to: string): boolean =>
  to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

const NEXT_THEME: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };

const ThemeToggle = (): React.JSX.Element => {
  const { theme, setTheme } = useTheme();
  const Icon = THEME_ICON[theme];
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground"
      title={`Theme: ${theme}`}
      aria-label={`Theme: ${theme}. Click to switch.`}
      onClick={() => setTheme(NEXT_THEME[theme])}
    >
      <Icon className="size-3.5" />
    </Button>
  );
};

const NavLink = ({ item, pathname }: { item: NavItem; pathname: string }): React.JSX.Element => {
  const active = isActivePath(pathname, item.to);
  return (
    <Link
      to={item.to}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-foreground/[0.07] font-medium text-foreground dark:bg-foreground/[0.1]"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground dark:hover:bg-foreground/[0.06]",
      )}
    >
      {active ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-ember" aria-hidden /> : null}
      <item.icon className="size-4 shrink-0" strokeWidth={2} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
};

/** Today / this week, live while a timer runs. */
const SidebarTotals = (): React.JSX.Element => {
  const { data: totals } = useTrackedTotals();
  const { data: active } = useActiveTimer();
  const runningToday = active && active.startedAt >= new Date().setHours(0, 0, 0, 0);

  const row = (label: string, seconds: number, live: boolean): React.JSX.Element => (
    <div className="flex items-baseline justify-between gap-2">
      <span className="label-caps">{label}</span>
      {live && active ? (
        <LiveDuration
          startedAt={active.startedAt}
          baseSeconds={seconds}
          format="short"
          className="font-mono text-xs tabular-nums"
        />
      ) : (
        <span className="font-mono text-xs tabular-nums">{formatDuration(seconds)}</span>
      )}
    </div>
  );

  return (
    <div className="space-y-1">
      {row("Today", totals?.todaySeconds ?? 0, Boolean(runningToday))}
      {row("This week", totals?.weekSeconds ?? 0, Boolean(active))}
    </div>
  );
};

export const AppLayout = (): React.JSX.Element => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // On every app start: remind about subscription months that are due (the
  // app checks the date when it opens; nothing is issued automatically), and
  // take the daily backup.
  const navigate = useNavigate();
  useEffect(() => {
    void remindDueSubscriptions((customerId) => {
      void navigate({ to: "/invoices", search: { newFor: customerId } });
    });
    void autoBackupIfDue();
  }, [navigate]);
  useSyncOnFocus();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar — transparent so the native window vibrancy shows through */}
      <aside className="flex w-48 shrink-0 flex-col">
        {/* Traffic-light clearance + draggable region */}
        <div data-tauri-drag-region className="h-10 shrink-0" />

        <div className="flex items-center gap-2 px-4 pb-4">
          <span className="flex size-6 items-center justify-center rounded-[7px] bg-foreground text-[12px] font-bold text-background">
            T
          </span>
          <span className="text-[15px] font-semibold tracking-tight">TimeKit</span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map((item) => (
            <NavLink key={item.to} item={item} pathname={pathname} />
          ))}
        </nav>

        <div className="space-y-3 px-3 pb-3">
          <div className="rounded-lg bg-foreground/[0.04] px-3 py-2.5 dark:bg-foreground/[0.06]">
            <SidebarTotals />
          </div>
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <NavLink item={{ to: "/settings", label: "Settings", icon: Settings }} pathname={pathname} />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Content surface — opaque, divided from the translucent sidebar */}
      <main className="relative flex flex-1 flex-col overflow-hidden border-l border-border bg-background">
        <div data-tauri-drag-region className="h-10 shrink-0" />
        <TimerBar />
        <div className="flex-1 overflow-y-auto px-8 pb-10 pt-6">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};
