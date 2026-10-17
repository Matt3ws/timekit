import { Document, Page, Text, View, Link, StyleSheet } from "@react-pdf/renderer";
import { formatTaxRate } from "@/lib/money";
import { formatDuration } from "@/lib/duration";
import { netAmount, sellerForInvoice } from "@/lib/billing";
import { invoiceFormat } from "@/lib/invoice-i18n";
import type { InvoiceEntrySnapshot, InvoiceTaskLinks } from "@/queries/use-invoices";
import type { Customer, Invoice, InvoiceLineItem, Settings } from "@/db/schema";

const INK = "#1c1917";
const MUTED = "#78716c";
const LINE = "#e7e5e4";

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 64, paddingHorizontal: 48, fontSize: 9.5, color: INK, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  seller: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold", textAlign: "right" },
  muted: { color: MUTED },
  small: { fontSize: 8.5, color: MUTED, lineHeight: 1.45 },
  bold: { fontFamily: "Helvetica-Bold" },
  twoCol: { flexDirection: "row", justifyContent: "space-between", marginBottom: 26 },
  billTo: { width: "50%" },
  label: { fontSize: 7.5, textTransform: "uppercase", color: MUTED, marginBottom: 5, letterSpacing: 0.8 },
  details: { width: "44%" },
  detailRow: { flexDirection: "row", paddingVertical: 1.5 },
  detailLabel: { width: 84, color: MUTED },
  detailValue: { flex: 1, textAlign: "right" },
  creditRef: { marginBottom: 14, padding: 8, borderWidth: 0.75, borderColor: LINE, borderRadius: 3 },
  trHead: { flexDirection: "row", borderBottomWidth: 1, borderColor: INK, paddingBottom: 5, marginBottom: 2 },
  tr: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderColor: LINE },
  projectHeader: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginTop: 10, marginBottom: 1 },
  cDesc: { width: "49%", paddingRight: 10 },
  cDescIndented: { paddingLeft: 10 },
  descMuted: { color: MUTED, fontSize: 8, marginTop: 2, lineHeight: 1.4 },
  cQty: { width: "9%", textAlign: "right" },
  cRate: { width: "21%", textAlign: "right" },
  cAmount: { width: "21%", textAlign: "right" },
  totals: { marginTop: 14, marginLeft: "auto", width: "48%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderColor: INK,
    fontSize: 11,
  },
  payment: { marginTop: 34, paddingTop: 10, borderTopWidth: 0.5, borderColor: LINE },
  section: { marginTop: 8 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderColor: INK,
  },
  bdTask: { marginBottom: 14 },
  bdTaskHead: { flexDirection: "row", borderBottomWidth: 1, borderColor: INK, paddingBottom: 4 },
  bdTaskTitle: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 9.5, paddingRight: 10 },
  bdTaskTotal: { width: "12%", fontFamily: "Helvetica-Bold", fontSize: 9.5, textAlign: "right" },
  bdColHead: { flexDirection: "row", paddingTop: 4, paddingBottom: 2 },
  bdRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderColor: LINE },
  bdDate: { width: "15%", fontSize: 8.5, color: MUTED },
  bdText: { flex: 1, fontSize: 8.5, color: "#44403c", lineHeight: 1.4, paddingRight: 10 },
  bdTime: { width: "12%", fontSize: 8.5, textAlign: "right" },
  bdLabel: { fontSize: 7.5, textTransform: "uppercase", color: MUTED, letterSpacing: 0.8 },
  linkTaskTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginBottom: 4 },
  linkRow: { paddingLeft: 12, marginBottom: 8 },
  linkRowUrl: { fontSize: 9, color: "#1d4ed8", textDecoration: "none" },
  pageNumber: { position: "absolute", bottom: 28, left: 48, right: 48, fontSize: 7.5, color: MUTED, textAlign: "right" },
});

type LineItem = InvoiceLineItem & {
  projectTitle: string | null;
  entries: InvoiceEntrySnapshot[];
};

export interface InvoiceDocumentProps {
  invoice: Invoice;
  customer: Customer;
  lineItems: LineItem[];
  taskLinks: InvoiceTaskLinks[];
  /** Fallback seller details for invoices issued before snapshots existed. */
  settings: Settings;
  /** Credit notes: the number of the invoice being credited. */
  creditedInvoiceNumber?: string | null;
}

interface ProjectGroup {
  projectTitle: string | null;
  items: LineItem[];
}

/** Group line items by project, preserving first-seen order. Hand-added lines form their own group. */
const groupByProject = (lineItems: LineItem[]): ProjectGroup[] => {
  const groups: ProjectGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of lineItems) {
    const key = item.projectId ?? "extra";
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ projectTitle: item.projectId ? item.projectTitle : null, items: [item] });
    } else {
      groups[existing]?.items.push(item);
    }
  }
  return groups;
};

/** A line's description: first line is the title, the rest is detail. */
const splitDescription = (description: string): { title: string; detail: string[] } => {
  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return { title: lines[0] ?? "", detail: lines.slice(1) };
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * The invoice / credit note PDF. Meets the Danish requirements for a full
 * invoice: sequential number, dates, both parties with CVR, delivery period,
 * quantity and unit price excl. moms, the moms basis, rate and amount.
 * Prices in TimeKit include moms, so net figures are derived per line.
 */
export const InvoiceDocument = ({
  invoice,
  customer,
  lineItems,
  taskLinks,
  settings,
  creditedInvoiceNumber,
}: InvoiceDocumentProps): React.JSX.Element => {
  const { t, money, number, date } = invoiceFormat(customer.invoiceLanguage);
  const seller = sellerForInvoice(invoice.sellerJson, settings);
  const isCredit = invoice.kind === "credit_note";
  const amount = (minor: number): string => money(minor, invoice.currency);
  const net = (minor: number): string => amount(netAmount(minor, invoice.taxRate));
  const groups = groupByProject(lineItems);
  const paymentDays = Math.max(0, Math.round((invoice.dueDate - invoice.issueDate) / DAY));
  // 0% = issued while not moms-registered: plain prices, no moms lines, and a note saying so.
  const withVat = invoice.taxRate > 0;

  const breakdown = groups.flatMap((group) =>
    group.items.flatMap((item) =>
      item.entries.length > 0
        ? [{ project: group.projectTitle, task: splitDescription(item.description).title, entries: item.entries }]
        : [],
    ),
  );

  const sellerAddress = [
    seller.addressLine1,
    seller.addressLine2,
    [seller.postalCode, seller.city].filter(Boolean).join(" "),
    seller.country,
  ].filter((line): line is string => Boolean(line));
  const customerAddress = [
    customer.addressLine1,
    customer.addressLine2,
    [customer.postalCode, customer.city].filter(Boolean).join(" "),
    customer.country,
  ].filter((line): line is string => Boolean(line));

  return (
    <Document title={`${isCredit ? t.creditNote : t.invoice} ${invoice.invoiceNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.seller}>{seller.companyName ?? ""}</Text>
            {sellerAddress.map((line) => (
              <Text key={line} style={styles.small}>
                {line}
              </Text>
            ))}
            {seller.vatNumber ? (
              <Text style={styles.small}>
                {t.vatNumber} {seller.vatNumber}
              </Text>
            ) : null}
            {seller.email ? <Text style={styles.small}>{seller.email}</Text> : null}
            {seller.phone ? (
              <Text style={styles.small}>
                {t.phone} {seller.phone}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.title}>{isCredit ? t.creditNote : t.invoice}</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.billTo}>
            <Text style={styles.label}>{t.billTo}</Text>
            <Text style={styles.bold}>{customer.companyName ?? customer.name}</Text>
            {customer.companyName ? <Text>{customer.name}</Text> : null}
            {customerAddress.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
            {customer.vatNumber ? (
              <Text>
                {t.vatNumber} {customer.vatNumber}
              </Text>
            ) : null}
          </View>
          <View style={styles.details}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{isCredit ? t.creditNoteNumber : t.invoiceNumber}</Text>
              {/* Older invoices carry 40-character UUID numbers: shrink those to fit the column. */}
              <Text style={[styles.detailValue, styles.bold, invoice.invoiceNumber.length > 20 ? { fontSize: 6.5 } : {}]}>
                {invoice.invoiceNumber}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t.issueDate}</Text>
              <Text style={styles.detailValue}>{date(invoice.issueDate)}</Text>
            </View>
            {!isCredit ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t.dueDate}</Text>
                <Text style={styles.detailValue}>{date(invoice.dueDate)}</Text>
              </View>
            ) : null}
            {invoice.periodStart && invoice.periodEnd ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t.period}</Text>
                <Text style={styles.detailValue}>
                  {date(invoice.periodStart)} – {date(invoice.periodEnd)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {isCredit && creditedInvoiceNumber ? (
          <View style={styles.creditRef}>
            <Text style={styles.bold}>{t.credits(creditedInvoiceNumber)}</Text>
          </View>
        ) : null}

        <View>
          <View style={styles.trHead}>
            <Text style={[styles.cDesc, styles.bold]}>{t.description}</Text>
            <Text style={[styles.cQty, styles.bold]}>{t.quantity}</Text>
            <Text style={[styles.cRate, styles.bold]}>{withVat ? t.unitPrice : t.unitPricePlain}</Text>
            <Text style={[styles.cAmount, styles.bold]}>{withVat ? t.amount : t.amountPlain}</Text>
          </View>
          {groups.map((group, groupIndex) => (
            <View key={group.items[0]?.id ?? groupIndex}>
              {group.projectTitle ? <Text style={styles.projectHeader}>{group.projectTitle}</Text> : null}
              {group.items.map((item) => {
                const { title, detail } = splitDescription(item.description);
                return (
                  <View key={item.id} style={styles.tr} wrap={false}>
                    <View style={[styles.cDesc, group.projectTitle ? styles.cDescIndented : {}]}>
                      <Text>{title}</Text>
                      {detail.map((line, index) => (
                        <Text key={index} style={styles.descMuted}>
                          {line}
                        </Text>
                      ))}
                    </View>
                    <Text style={styles.cQty}>{number(item.quantity)}</Text>
                    <Text style={styles.cRate}>{net(item.unitPrice)}</Text>
                    <Text style={styles.cAmount}>{net(item.amount)}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.totals} wrap={false}>
          {withVat ? (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>{t.subtotal}</Text>
                <Text>{amount(invoice.subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>{t.vat(formatTaxRate(invoice.taxRate))}</Text>
                <Text>{amount(invoice.taxAmount)}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.grandRow}>
            <Text style={styles.bold}>{t.total(invoice.currency)}</Text>
            <Text style={styles.bold}>{amount(invoice.total)}</Text>
          </View>
          {!withVat ? <Text style={[styles.small, { marginTop: 6, textAlign: "right" }]}>{t.notVatRegistered}</Text> : null}
        </View>

        <View style={styles.payment} wrap={false}>
          {!isCredit ? (
            <>
              <Text style={styles.label}>{t.payment}</Text>
              <Text>
                {t.paymentTerms(paymentDays)}
                {seller.bankName ? ` · ${t.bank}: ${seller.bankName}` : ""}
                {seller.bankAccount ? ` · ${t.account} ${seller.bankAccount}` : ""}
              </Text>
              {seller.iban || seller.swift ? (
                <Text style={styles.small}>
                  {seller.iban ? `IBAN ${seller.iban}` : ""}
                  {seller.iban && seller.swift ? " · " : ""}
                  {seller.swift ? `SWIFT/BIC ${seller.swift}` : ""}
                </Text>
              ) : null}
              <Text style={[styles.small, { marginTop: 3 }]}>{t.paymentReference(invoice.invoiceNumber)}</Text>
            </>
          ) : null}
          {invoice.notes ? <Text style={{ marginTop: 8 }}>{invoice.notes}</Text> : null}
        </View>

        {breakdown.length > 0 ? (
          <View break style={styles.section}>
            <Text style={styles.sectionTitle}>{t.breakdown}</Text>
            {breakdown.map((group, index) => (
              <View key={index} style={styles.bdTask}>
                {/* Heading and column labels stay together; a long task continues on the next page row by row. */}
                <View wrap={false}>
                  <View style={styles.bdTaskHead}>
                    <Text style={styles.bdTaskTitle}>
                      {group.project ? `${group.project} · ${group.task}` : group.task}
                    </Text>
                    <Text style={styles.bdTaskTotal}>
                      {formatDuration(group.entries.reduce((sum, entry) => sum + entry.durationSeconds, 0))}
                    </Text>
                  </View>
                  <View style={styles.bdColHead}>
                    <Text style={[styles.bdDate, styles.bdLabel]}>{t.entryDate}</Text>
                    <Text style={[styles.bdText, styles.bdLabel]}>{t.description}</Text>
                    <Text style={[styles.bdTime, styles.bdLabel]}>{t.entryTime}</Text>
                  </View>
                </View>
                {group.entries.map((entry, entryIndex) => (
                  <View key={entryIndex} style={styles.bdRow} wrap={false}>
                    <Text style={styles.bdDate}>{date(entry.startedAt)}</Text>
                    <Text style={styles.bdText}>
                      {(entry.description ?? "")
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .join("\n") || "-"}
                    </Text>
                    <Text style={styles.bdTime}>{formatDuration(entry.durationSeconds)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {taskLinks.length > 0 ? (
          <View break={breakdown.length === 0} style={styles.section}>
            <Text style={styles.sectionTitle}>{t.links}</Text>
            {taskLinks.map((group, index) => (
              <View key={index} style={styles.bdTask} wrap={false}>
                <Text style={styles.linkTaskTitle}>
                  {group.projectTitle ? `${group.projectTitle} · ${group.taskTitle}` : group.taskTitle}
                </Text>
                {group.links.map((link, linkIndex) => (
                  <View key={linkIndex} style={styles.linkRow}>
                    <Text>{link.title}</Text>
                    <Link src={link.url} style={styles.linkRowUrl}>
                      {link.url}
                    </Link>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${invoice.invoiceNumber} · ${t.page(pageNumber, totalPages)}`}
          fixed
        />
      </Page>
    </Document>
  );
};
