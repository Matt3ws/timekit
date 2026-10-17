import { Loader2 } from "lucide-react";
import { Button } from "@/ui/button";
import { DialogFooter } from "@/ui/dialog";

interface DialogActionsProps {
  onCancel: () => void;
  submitLabel: string;
  pending?: boolean;
}

/** Standard form-dialog footer: Cancel + a submit button that spins while saving. */
export const DialogActions = ({ onCancel, submitLabel, pending = false }: DialogActionsProps): React.JSX.Element => (
  <DialogFooter className="pt-2">
    <Button type="button" variant="outline" onClick={onCancel}>
      Cancel
    </Button>
    <Button type="submit" disabled={pending} className="min-w-20">
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {submitLabel}
    </Button>
  </DialogFooter>
);
