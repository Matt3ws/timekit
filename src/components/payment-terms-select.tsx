import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";

/** The payment terms you can pick, in days. */
export const PAYMENT_TERMS_DAYS = [0, 8, 14, 30, 45, 60] as const;

const termsLabel = (days: number): string => (days === 0 ? "On receipt" : `${days} days`);

interface PaymentTermsSelectProps {
  id?: string;
  /** Days as a string, the way the forms hold it. */
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/**
 * Payment terms as a fixed list instead of free text. A saved value that isn't
 * in the list is kept as an extra option, so nothing changes until you pick.
 */
export const PaymentTermsSelect = ({
  id,
  value,
  onValueChange,
  className,
}: PaymentTermsSelectProps): React.JSX.Element => {
  const current = Number(value);
  const options =
    Number.isInteger(current) && !(PAYMENT_TERMS_DAYS as readonly number[]).includes(current)
      ? [...PAYMENT_TERMS_DAYS, current].sort((a, b) => a - b)
      : [...PAYMENT_TERMS_DAYS];
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className={className ?? "w-full"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((days) => (
          <SelectItem key={days} value={String(days)}>
            {termsLabel(days)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
