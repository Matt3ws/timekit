import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/ui/button";

/** Shared page size for the paginated list views. */
export const PAGE_SIZE = 25;

interface PaginationProps {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Prev/next controls with a "from-to of total" summary. Hidden when there's nothing to page. */
export const Pagination = ({ page, total, onPageChange }: PaginationProps): React.JSX.Element | null => {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total === 0) {
    return null;
  }
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between px-1 pt-3 text-xs text-muted-foreground">
      <span className="font-mono tabular-nums">
        {from}&ndash;{to} of {total}
      </span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-12 text-center font-mono tabular-nums">
            {page} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </nav>
  );
};
