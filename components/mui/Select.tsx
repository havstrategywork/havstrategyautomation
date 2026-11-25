"use client";
// A dropdown built with Material UI. It works inside plain HTML forms (it submits `name` like a native <select>), uncontrolled with defaultValue
// or controlled with value + onChange. An option whose value is "" is the "empty" choice (e.g. "Any") and is shown as its label.
import { useState } from "react";
import MenuItem from "@mui/material/MenuItem";
import MuiSelect from "@mui/material/Select";

export type Option = string | { value: string; label: string; disabled?: boolean };
type Props = { options: Option[]; name?: string; label?: string; defaultValue?: string; value?: string; onChange?: (value: string) => void; compact?: boolean; ariaLabel?: string };

export default function Select({ options, name, label, defaultValue = "", value, onChange, compact, ariaLabel }: Props) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const select = (
    <MuiSelect
      name={name} value={opts.some((o) => o.value === current) ? current : ""} displayEmpty size="small" fullWidth={!compact} sx={compact ? { minWidth: 120 } : undefined}
      onChange={(e) => { setInner(e.target.value); onChange?.(e.target.value); }}
      inputProps={{ "aria-label": ariaLabel ?? label }}
      MenuProps={{ slotProps: { paper: { style: { maxHeight: 320 } } } }}
    >
      {opts.map((o) => <MenuItem key={o.value} value={o.value} disabled={o.disabled}>{o.label}</MenuItem>)}
    </MuiSelect>
  );
  return label ? <div className="lbl mui-scope"><span>{label}</span>{select}</div> : <span className="mui-scope">{select}</span>;
}
