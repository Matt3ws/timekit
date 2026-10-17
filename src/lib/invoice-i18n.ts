import type { InvoiceLanguage } from "@/db/schema";

/** Every text printed on an invoice PDF, per language. */
export interface InvoiceLabels {
  invoice: string;
  creditNote: string;
  invoiceNumber: string;
  creditNoteNumber: string;
  issueDate: string;
  dueDate: string;
  period: string;
  billTo: string;
  from: string;
  description: string;
  hours: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  /** Column headers when the invoice carries no moms. */
  unitPricePlain: string;
  amountPlain: string;
  /** Printed when the seller isn't moms-registered. */
  notVatRegistered: string;
  subtotal: string;
  vat: (rate: string) => string;
  total: (currency: string) => string;
  vatNumber: string;
  phone: string;
  payment: string;
  bank: string;
  account: string;
  paymentTerms: (days: number) => string;
  paymentReference: (number: string) => string;
  credits: (number: string) => string;
  breakdown: string;
  /** Breakdown table column headings. */
  entryDate: string;
  entryTime: string;
  links: string;
  page: (current: number, total: number) => string;
}

const da: InvoiceLabels = {
  invoice: "Faktura",
  creditNote: "Kreditnota",
  invoiceNumber: "Fakturanr.",
  creditNoteNumber: "Kreditnotanr.",
  issueDate: "Fakturadato",
  dueDate: "Forfaldsdato",
  period: "Leveringsperiode",
  billTo: "Faktureres til",
  from: "Fra",
  description: "Beskrivelse",
  hours: "Timer",
  quantity: "Antal",
  unitPrice: "Pris ekskl. moms",
  amount: "Beløb ekskl. moms",
  unitPricePlain: "Pris",
  amountPlain: "Beløb",
  notVatRegistered: "Virksomheden er ikke momsregistreret. Der er ikke beregnet moms.",
  subtotal: "Subtotal ekskl. moms",
  vat: (rate) => `Moms ${rate}`,
  total: (currency) => `I alt ${currency}`,
  vatNumber: "CVR-nr.",
  phone: "Tlf.",
  payment: "Betaling",
  bank: "Bank",
  account: "Reg.nr./kontonr.",
  paymentTerms: (days) => `Netto ${days} dage`,
  paymentReference: (number) => `Angiv venligst fakturanr. ${number} ved betaling.`,
  credits: (number) => `Krediterer faktura ${number}`,
  breakdown: "Specifikation",
  entryDate: "Dato",
  entryTime: "Tid",
  links: "Dokumenter og links",
  page: (current, total) => `Side ${current} af ${total}`,
};

const en: InvoiceLabels = {
  invoice: "Invoice",
  creditNote: "Credit note",
  invoiceNumber: "Invoice no.",
  creditNoteNumber: "Credit note no.",
  issueDate: "Invoice date",
  dueDate: "Due date",
  period: "Service period",
  billTo: "Bill to",
  from: "From",
  description: "Description",
  hours: "Hours",
  quantity: "Qty",
  unitPrice: "Unit price excl. VAT",
  amount: "Amount excl. VAT",
  unitPricePlain: "Unit price",
  amountPlain: "Amount",
  notVatRegistered: "The seller is not VAT registered. No VAT has been charged.",
  subtotal: "Subtotal excl. VAT",
  vat: (rate) => `VAT ${rate}`,
  total: (currency) => `Total ${currency}`,
  vatNumber: "VAT no.",
  phone: "Phone",
  payment: "Payment",
  bank: "Bank",
  account: "Account no.",
  paymentTerms: (days) => `Net ${days} days`,
  paymentReference: (number) => `Please quote invoice no. ${number} with your payment.`,
  credits: (number) => `Credits invoice ${number}`,
  breakdown: "Detailed breakdown",
  entryDate: "Date",
  entryTime: "Time",
  links: "Documents & links",
  page: (current, total) => `Page ${current} of ${total}`,
};

const LABELS: Record<InvoiceLanguage, InvoiceLabels> = { da, en };
const LOCALE: Record<InvoiceLanguage, string> = { da: "da-DK", en: "en-GB" };

/** Labels and number/date formatting for an invoice in the given language. */
export interface InvoiceFormat {
  t: InvoiceLabels;
  money: (minor: number, currency: string) => string;
  number: (value: number) => string;
  date: (ms: number) => string;
}

export const invoiceFormat = (language: InvoiceLanguage): InvoiceFormat => {
  const locale = LOCALE[language];
  return {
    t: LABELS[language],
    money: (minor, currency) =>
      new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100),
    number: (value) => value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    date: (ms) => new Date(ms).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" }),
  };
};
