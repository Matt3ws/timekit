import { useState } from "react";
import { toast } from "sonner";
import { getInvoiceDetail, useSetInvoicePdfPath } from "@/queries/use-invoices";
import { getSettingsRow } from "@/queries/use-settings";
import { openPdf, revealPdf, saveInvoicePdf, saveInvoicePdfAs } from "@/features/invoices/save-invoice-pdf";
import type { InvoiceDocumentProps } from "@/features/invoices/invoice-document";

export interface InvoicePdfActions {
  /** Regenerate the PDF and open it in Preview. */
  open: (invoiceId: string) => Promise<void>;
  /** Save a copy wherever you like (to attach to an email). */
  saveAs: (invoiceId: string) => Promise<void>;
  /** Regenerate the PDF and show it in Finder. */
  reveal: (invoiceId: string) => Promise<void>;
  /** The invoice whose PDF is being generated, if any. */
  busyId: string | null;
}

const loadProps = async (invoiceId: string): Promise<InvoiceDocumentProps> => {
  const [detail, settings] = await Promise.all([getInvoiceDetail(invoiceId), getSettingsRow()]);
  if (!detail) {
    throw new Error("Invoice not found");
  }
  return { ...detail, settings };
};

/**
 * Everything you can do with an invoice's PDF. The file is regenerated every
 * time, so it always reflects the current template; the invoice data itself
 * (lines, totals, seller snapshot) is frozen at issue.
 */
export const useInvoicePdf = (): InvoicePdfActions => {
  const setPdfPath = useSetInvoicePdfPath();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (invoiceId: string, action: (props: InvoiceDocumentProps) => Promise<void>): Promise<void> => {
    setBusyId(invoiceId);
    try {
      await action(await loadProps(invoiceId));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[invoice pdf]", error);
      toast.error(`PDF error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyId(null);
    }
  };

  const saveLocal = async (props: InvoiceDocumentProps): Promise<string> => {
    const path = await saveInvoicePdf(props);
    if (path !== props.invoice.pdfPath) {
      await setPdfPath.mutateAsync({ id: props.invoice.id, pdfPath: path });
    }
    return path;
  };

  return {
    busyId,
    open: (invoiceId) => run(invoiceId, async (props) => openPdf(await saveLocal(props))),
    reveal: (invoiceId) => run(invoiceId, async (props) => revealPdf(await saveLocal(props))),
    saveAs: (invoiceId) =>
      run(invoiceId, async (props) => {
        const path = await saveInvoicePdfAs(props);
        if (path) {
          toast.success("PDF saved");
        }
      }),
  };
};
