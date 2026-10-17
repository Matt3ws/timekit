import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

/** Opens a stored receipt in its default app (Preview), with a toast if the file is gone. */
export const openReceipt = async (path: string): Promise<void> => {
  try {
    await openPath(path);
  } catch {
    toast.error("Couldn't open the receipt. The file may have been moved or deleted.");
  }
};
