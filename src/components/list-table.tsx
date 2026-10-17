import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { Table, TableBody, TableHeader, TableRow } from "@/ui/table";

interface ListTableProps {
  /** The header row's `TableHead` cells. */
  head: React.ReactNode;
  /** The body's `TableRow`s. */
  children: React.ReactNode;
}

/**
 * The shared list table: a flush card, small-caps header and roomy rows, so
 * projects, customers and invoices read as one family.
 */
export const ListTable = ({ head, children }: ListTableProps): React.JSX.Element => (
  <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <Table className="[&_td]:px-4 [&_td]:py-2.5 [&_th]:px-4">
      <TableHeader className="bg-foreground/[0.025] dark:bg-foreground/[0.04] [&_th]:h-9 [&_th]:text-[10.5px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.09em] [&_th]:text-muted-foreground">
        <TableRow className="hover:bg-transparent">{head}</TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  </Card>
);

/** Loading placeholder shaped like a {@link ListTable}. */
export const ListTableSkeleton = ({ rows = 6 }: { rows?: number }): React.JSX.Element => (
  <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <div className="h-9 border-b bg-foreground/[0.025] dark:bg-foreground/[0.04]" />
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-1/5" />
        <Skeleton className="ml-auto h-4 w-16" />
      </div>
    ))}
  </Card>
);
