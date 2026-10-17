import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, MoreHorizontal, Pencil, Trash2, FolderKanban, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Pagination } from "@/components/pagination";
import { ListTable, ListTableSkeleton } from "@/components/list-table";
import { EmptyState } from "@/components/empty-state";
import { CustomerDot, CustomerLabel } from "@/components/customer-dot";
import { PROJECT_STATUS_LABELS } from "@/components/status-chip";
import { ProjectStatusBadge } from "@/features/projects/project-status-badge";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { TableCell, TableHead, TableRow } from "@/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { ProjectDialog } from "@/features/projects/project-dialog";
import { usePaginatedProjects, useDeleteProject, type ProjectWithMeta } from "@/queries/use-projects";
import { useCustomers } from "@/queries/use-customers";
import { useSettings } from "@/queries/use-settings";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { effectiveCurrency, effectiveHourlyRate } from "@/lib/billing";
import { formatDuration } from "@/lib/duration";
import { formatMoney } from "@/lib/money";
import { PROJECT_STATUS, type ProjectStatus, type Settings } from "@/db/schema";

interface ProjectSettingsInput {
  project: ProjectWithMeta;
  settings: Settings;
}

/** What the next invoice would charge (minor units): unbilled time rounded per task, or an unbilled fixed price. */
const unbilledMinor = ({ project, settings }: ProjectSettingsInput): number =>
  project.billingType === "fixed"
    ? project.billedAt
      ? 0
      : (project.fixedPrice ?? 0)
    : Math.round((Number(project.unbilledQuarterHours) / 4) * effectiveHourlyRate(project, settings));

/** Billed when there is invoiced work and nothing left waiting for the next invoice. */
const isBilled = ({ project, settings }: ProjectSettingsInput): boolean =>
  Number(project.billedMinor) > 0 && unbilledMinor({ project, settings }) === 0;

/** "Hourly · 850,00 kr./h" or "Fixed · 12.000,00 kr." */
const billingSummary = ({ project, settings }: ProjectSettingsInput): string => {
  const currency = effectiveCurrency(project, settings);
  return project.billingType === "fixed"
    ? `Fixed · ${formatMoney(project.fixedPrice ?? 0, currency)}`
    : `Hourly · ${formatMoney(effectiveHourlyRate(project, settings), currency)}/h`;
};

/** All projects: search, filter by customer and status, and what each has waiting to be billed. */
export const ProjectsPage = (): React.JSX.Element => {
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => setPage(1), [debouncedSearch, customerId, status]);

  const { data, isLoading } = usePaginatedProjects({
    page,
    search: debouncedSearch,
    customerId: customerId === "all" ? null : customerId,
    status: status === "all" ? null : (status as ProjectStatus),
  });
  const { data: customers } = useCustomers();
  const { data: settings } = useSettings();
  const remove = useDeleteProject();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectWithMeta | undefined>(undefined);
  const [toDelete, setToDelete] = useState<ProjectWithMeta | undefined>(undefined);

  const projects = data?.rows ?? [];
  const total = data?.total ?? 0;
  const filtering = debouncedSearch.trim().length > 0 || customerId !== "all" || status !== "all";

  const openNew = (): void => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const clearFilters = (): void => {
    setSearch("");
    setCustomerId("all");
    setStatus("all");
  };

  return (
    <>
      <PageHeader
        title="Projects"
        description="Track time and bill by project."
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            New project
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="pl-8"
          />
        </div>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="w-48" aria-label="Filter by customer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers?.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                <CustomerDot customerId={customer.id} />
                {customer.companyName ?? customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PROJECT_STATUS.map((value) => (
              <SelectItem key={value} value={value}>
                {PROJECT_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading || !settings ? (
        <ListTableSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={filtering ? "No projects match your filters" : "No projects yet"}
          description={
            filtering
              ? "Try another search, customer or status."
              : "A project groups the tasks you track time on for one customer."
          }
          action={
            filtering ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={openNew}>
                <Plus className="size-4" />
                Create your first project
              </Button>
            )
          }
        />
      ) : (
        <>
          <ListTable
            head={
              <>
                <TableHead>Project</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Tracked</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </>
            }
          >
            {projects.map((project) => {
              const amount = Number(project.billedMinor) + unbilledMinor({ project, settings });
              const billed = isBilled({ project, settings });
              return (
                <TableRow key={project.id}>
                  <TableCell className="max-w-[18rem]">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="block truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {project.title}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">{billingSummary({ project, settings })}</div>
                  </TableCell>
                  <TableCell className="max-w-[14rem] text-muted-foreground">
                    <CustomerLabel
                      customerId={project.customerId}
                      name={project.customerCompany ?? project.customerName}
                      className="max-w-full"
                    />
                  </TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={project.status} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-[13px] tabular-nums",
                      project.trackedSeconds === 0 && "text-muted-foreground",
                    )}
                  >
                    {formatDuration(project.trackedSeconds)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-[13px] tabular-nums",
                      amount === 0 ? "text-muted-foreground" : billed ? "font-medium text-success" : "font-medium text-ember",
                    )}
                    title={amount === 0 ? undefined : billed ? "Billed" : "Not billed"}
                  >
                    {formatMoney(amount, effectiveCurrency(project, settings))}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          aria-label={`Actions for ${project.title}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(project);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setToDelete(project)}>
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </ListTable>
          <Pagination page={page} total={total} onPageChange={setPage} />
        </>
      )}

      <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} project={editing} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(undefined)}
        title={`Delete ${toDelete?.title}?`}
        description="This deletes the project, its tasks and all tracked time. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (toDelete) {
            remove.mutate({ id: toDelete.id });
            setToDelete(undefined);
          }
        }}
      />
    </>
  );
};
