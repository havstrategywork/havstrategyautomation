"use client";
// Calendar date pickers built with Material UI. They show DD/MM/YYYY and submit the date as YYYY-MM-DD (empty = no date) in a hidden input called `name`,
// exactly what the native <input type="date"> sent, so the server code that reads the forms does not change.
import { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

const FORMAT = "DD/MM/YYYY", iso = (d: Dayjs | null) => (d && d.isValid() ? d.format("YYYY-MM-DD") : "");
const parse = (s?: string) => (s ? dayjs(s) : null);
const field = () => ({ textField: { size: "small" as const, fullWidth: true }, field: { clearable: true } });

export function DateField({ name, label, defaultValue, min, max }: { name: string; label: string; defaultValue?: string; min?: string; max?: string }) {
  const [v, setV] = useState<Dayjs | null>(parse(defaultValue));
  return (
    <div className="lbl mui-scope" role="group" aria-label={label}>
      <span>{label}</span>
      <DatePicker value={v} onChange={setV} format={FORMAT} minDate={parse(min) ?? undefined} maxDate={parse(max) ?? undefined} slotProps={field()} />
      <input type="hidden" name={name} value={iso(v)} />
    </div>
  );
}

/** From / To, linked: "From" can't go past "To" and "To" can't go before "From". Neither can be empty. */
export function DateRange({ fromName = "from", toName = "to", from, to, max }: { fromName?: string; toName?: string; from: string; to: string; max?: string }) {
  const [a, setA] = useState<Dayjs | null>(parse(from)), [b, setB] = useState<Dayjs | null>(parse(to));
  const top = parse(max) ?? undefined, earlier = (x: Dayjs | null, y?: Dayjs) => (x && y ? (x.isBefore(y) ? x : y) : (x ?? y) ?? undefined);
  return (
    <>
      <div className="lbl mui-scope" role="group" aria-label="From"><span>From</span><DatePicker value={a} onChange={(x) => x && setA(x)} format={FORMAT} maxDate={earlier(b, top)} slotProps={{ ...field(), field: {} }} /><input type="hidden" name={fromName} value={iso(a)} /></div>
      <div className="lbl mui-scope" role="group" aria-label="To"><span>To</span><DatePicker value={b} onChange={(x) => x && setB(x)} format={FORMAT} minDate={a ?? undefined} maxDate={top} slotProps={{ ...field(), field: {} }} /><input type="hidden" name={toName} value={iso(b)} /></div>
    </>
  );
}
