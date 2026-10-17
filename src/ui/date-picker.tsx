import { useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { da } from "react-day-picker/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Calendar } from "@/ui/calendar";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";

const formatDate = (date: Date): string =>
  date.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

const pad = (value: number): string => String(value).padStart(2, "0");

const TRIGGER = "h-9 w-full justify-start gap-2 px-3 font-normal [&_svg]:text-muted-foreground";

interface DateTimePickerProps {
  value: number;
  onChange: (ms: number) => void;
  id?: string;
}

/** Date + time picker over an epoch-ms value: calendar popover plus a time field. */
export const DateTimePicker = ({ value, onChange, id }: DateTimePickerProps): React.JSX.Element => {
  const [open, setOpen] = useState(false);
  const date = new Date(value);

  const onDay = (picked: Date | undefined): void => {
    if (!picked) {
      return;
    }
    onChange(
      new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), date.getHours(), date.getMinutes()).getTime(),
    );
    setOpen(false);
  };

  const onTime = (text: string): void => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!match) {
      return;
    }
    onChange(
      new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(match[1]), Number(match[2])).getTime(),
    );
  };

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className={cn(TRIGGER, "flex-1")}>
            <CalendarIcon className="size-4" />
            {formatDate(date)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" locale={da} selected={date} onSelect={onDay} defaultMonth={date} />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        aria-label="Time"
        className="w-[92px] font-mono tabular-nums"
        value={`${pad(date.getHours())}:${pad(date.getMinutes())}`}
        onChange={(event) => onTime(event.target.value)}
      />
    </div>
  );
};

interface DatePickerProps {
  value: number | null;
  onChange: (ms: number | null) => void;
  placeholder?: string;
  id?: string;
}

/** Date-only picker over an epoch-ms value (null = unset), clearable. */
export const DatePicker = ({
  value,
  onChange,
  placeholder = "Select date",
  id,
}: DatePickerProps): React.JSX.Element => {
  const [open, setOpen] = useState(false);
  const date = value != null ? new Date(value) : undefined;

  const onDay = (picked: Date | undefined): void => {
    onChange(picked ? new Date(picked.getFullYear(), picked.getMonth(), picked.getDate()).getTime() : null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className={cn(TRIGGER, !date && "text-muted-foreground")}>
            <CalendarIcon className="size-4" />
            {date ? formatDate(date) : placeholder}
          </Button>
        </PopoverTrigger>
        {date ? (
          <button
            type="button"
            aria-label="Clear date"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => onChange(null)}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" locale={da} selected={date} onSelect={onDay} defaultMonth={date} />
      </PopoverContent>
    </Popover>
  );
};
