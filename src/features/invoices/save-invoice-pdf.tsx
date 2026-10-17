import { writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { save } from "@tauri-apps/plugin-dialog";
import type { InvoiceDocumentProps } from "@/features/invoices/invoice-document";

/**
 * Render the invoice PDF to bytes. @react-pdf/renderer (and the template) are
 * imported on demand: they are most of the bundle and only needed here.
 */
export const renderInvoicePdf = async (props: InvoiceDocumentProps): Promise<Uint8Array> => {
  const [{ pdf }, { InvoiceDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/features/invoices/invoice-document"),
  ]);
  const blob = await pdf(<InvoiceDocument {...props} />).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
};

/** A file name from the invoice number: user-defined prefixes may contain "/" and other unsafe characters. */
export const invoiceFileName = (invoiceNumber: string): string =>
  `${invoiceNumber.replace(/[^\p{L}\p{N}._-]+/gu, "-")}.pdf`;

/** Render the invoice to a PDF, save it under the app data dir, and return the file path. */
export const saveInvoicePdf = async (props: InvoiceDocumentProps): Promise<string> => {
  const bytes = await renderInvoicePdf(props);
  const dir = await join(await appDataDir(), "invoices");
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  const path = await join(dir, invoiceFileName(props.invoice.invoiceNumber));
  await writeFile(path, bytes);
  return path;
};

/** Ask where to save a copy of the PDF (e.g. to attach to an email). Returns null when cancelled. */
export const saveInvoicePdfAs = async (props: InvoiceDocumentProps): Promise<string | null> => {
  const path = await save({
    title: "Save invoice PDF",
    defaultPath: invoiceFileName(props.invoice.invoiceNumber),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!path) {
    return null;
  }
  await writeFile(path, await renderInvoicePdf(props));
  return path;
};

/** Open a saved PDF in the OS default viewer. */
export const openPdf = async (path: string): Promise<void> => {
  await openPath(path);
};

/** Show a saved PDF in Finder. */
export const revealPdf = async (path: string): Promise<void> => {
  await revealItemInDir(path);
};
