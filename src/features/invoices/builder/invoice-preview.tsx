import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { renderInvoicePdf } from "@/features/invoices/save-invoice-pdf";
import type { InvoiceDocumentProps } from "@/features/invoices/invoice-document";

interface InvoicePreviewProps {
  /** null while there is nothing to preview. */
  document: InvoiceDocumentProps | null;
}

/**
 * The real PDF, rendered from the draft and shown inline. Re-rendered shortly
 * after typing stops, so edits appear in the preview within a moment.
 */
export const InvoicePreview = ({ document }: InvoicePreviewProps): React.JSX.Element => {
  const [url, setUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!document) {
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    const timer = window.setTimeout(async () => {
      setRendering(true);
      try {
        const bytes = await renderInvoicePdf(document);
        if (cancelled) {
          return;
        }
        created = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "application/pdf" }));
        setUrl(created);
        setError(null);
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : String(renderError));
        }
      } finally {
        if (!cancelled) {
          setRendering(false);
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // Revoke on the next render's cleanup, after the new URL has replaced it.
      if (created) {
        const old = created;
        window.setTimeout(() => URL.revokeObjectURL(old), 2000);
      }
    };
  }, [document]);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-lg border border-border bg-muted/40">
      {url ? (
        <iframe title="Invoice preview" src={`${url}#toolbar=0&navpanes=0&view=FitH`} className="size-full" />
      ) : (
        <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
          {document ? "Rendering preview…" : "Select work to preview the invoice"}
        </div>
      )}
      {rendering && url ? (
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
          <Loader2 className="size-3 animate-spin" />
          Updating
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-x-3 bottom-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Preview failed: {error}
        </div>
      ) : null}
    </div>
  );
};
