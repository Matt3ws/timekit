import { Button } from "@/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Red confirm button for irreversible actions (the default). */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Small yes/no confirmation. Cancel comes first in the tab order, so it gets the
 * initial focus and Return never confirms by accident; the confirm button is red
 * when `destructive`.
 */
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = true,
  onConfirm,
}: ConfirmDialogProps): React.JSX.Element => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="gap-5" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle className="text-base">{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">Confirm or cancel this action.</DialogDescription>
        )}
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
