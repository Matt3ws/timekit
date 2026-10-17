import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Card } from "@/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { nextRegistrationRenewal } from "@/lib/billing";
import { useRollingTurnover, VAT_REGISTRATION_LIMIT } from "@/queries/use-bookkeeping";
import type { Settings } from "@/db/schema";

const DAY = 24 * 60 * 60 * 1000;

interface TurnoverMeterProps {
  settings: Settings;
  /** Unbilled work in the default currency, minor units incl. moms — what invoicing it would add. */
  unbilled: number;
}

/**
 * While not moms-registered: turnover of the last 12 months against the
 * 50.000 kr limit, with what the unbilled work would add. Ember from 80%,
 * red from 100% (moms registration is due).
 */
export const TurnoverMeter = ({ settings, unbilled }: TurnoverMeterProps): React.JSX.Element | null => {
  const { data: turnover } = useRollingTurnover();
  if (settings.vatRegistered || turnover === undefined) {
    return null;
  }
  const share = turnover / VAT_REGISTRATION_LIMIT;
  const projected = (turnover + unbilled) / VAT_REGISTRATION_LIMIT;
  const tone = share >= 1 ? "danger" : share >= 0.8 ? "warn" : "ok";
  const money = (minor: number): string => formatMoney(minor, settings.currency);

  return (
    <Card className="gap-2 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-caps">Moms limit · last 12 months</span>
        <span className="font-mono text-sm tabular-nums">
          <span className="font-semibold">{money(turnover)}</span>
          <span className="text-muted-foreground"> / {money(VAT_REGISTRATION_LIMIT)}</span>
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        {unbilled > 0 ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/15"
            style={{ width: `${Math.min(100, projected * 100)}%` }}
          />
        ) : null}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            tone === "danger" ? "bg-destructive" : tone === "warn" ? "bg-ember" : "bg-success",
          )}
          style={{ width: `${Math.min(100, share * 100)}%` }}
        />
      </div>
      <p className={cn("text-xs", tone === "ok" ? "text-muted-foreground" : tone === "warn" ? "text-ember" : "text-destructive")}>
        {tone === "danger"
          ? "You have passed 50.000 kr. Register for moms on virk.dk now, then switch on “Moms-registered” in Settings."
          : tone === "warn"
            ? `Close to the limit: register for moms before you pass it.${unbilled > 0 ? ` Your unbilled work adds ${money(unbilled)}.` : ""}`
            : unbilled > 0
              ? `Invoicing your unbilled work would add ${money(unbilled)}.`
              : "Not moms-registered: invoices go out without moms until you pass 50.000 kr."}
      </p>
    </Card>
  );
};

/** From 90 days before: renew the "personlig mindre virksomhed" registration on virk.dk. */
export const RenewalNotice = ({ settings }: { settings: Settings }): React.JSX.Element | null => {
  if (settings.vatRegistered) {
    return null;
  }
  if (!settings.companyRegisteredAt) {
    return (
      <Link
        to="/settings"
        className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <CalendarClock className="size-3.5" />
        Add your registration date in Settings to get a reminder before the 3-year renewal.
      </Link>
    );
  }
  const renewal = nextRegistrationRenewal(settings.companyRegisteredAt);
  const days = Math.ceil((renewal - Date.now()) / DAY);
  if (days > 90) {
    return null;
  }
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-ember-line bg-ember-soft/60 px-3.5 py-2.5 text-sm">
      <AlertTriangle className="size-4 shrink-0 text-ember" />
      <span>
        Renew your registration on <span className="font-medium">virk.dk</span> by{" "}
        <span className="font-medium">
          {new Date(renewal).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </span>{" "}
        <span className="text-muted-foreground">({days <= 0 ? "today" : `${days} days`})</span>, or it lapses.
      </span>
    </div>
  );
};
