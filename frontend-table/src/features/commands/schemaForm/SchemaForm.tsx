"use client";

import { useMemo } from "react";

import { enrichField } from "./autoSchema";
import { BasisPointsInput } from "./BasisPointsInput";
import { CardField, HandsField } from "./CardPicker";
import { ClubPicker, TournamentPicker, UserPicker } from "./EntityPickers";
import { MoneyInput } from "./MoneyInput";
import { SliderInput } from "./SliderInput";
import { orderedFields, type FieldSchema, type RpcSchema } from "./schemaTypes";
import { validate } from "./validate";

const FIELD =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-gold/50 focus:ring-1 focus:ring-gold/30";

/**
 * SchemaForm (UI review P0-1): renders a real, labeled form from a generated
 * RPC schema — pickers for entity refs, MoneyInput/BasisPointsInput for money
 * and rake, selects for enums, toggles for booleans. One renderer covers every
 * command, so a club owner never sees, edits, or pastes raw JSON: every input
 * is a plain-English labelled control. There is deliberately no raw-JSON escape
 * hatch — the Command Center is an operator tool, not a payload editor.
 */
export function SchemaForm({
  schema,
  values,
  onChange,
}: {
  schema: RpcSchema;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const errors = useMemo(() => validate(schema, values), [schema, values]);
  const errorFor = (name: string) => errors.find((e) => e.field === name);

  const set = (name: string, v: unknown) => onChange({ ...values, [name]: v });

  // Upgrade every field (generated OR synthesized) to its richest control.
  const fields = orderedFields(schema).map(({ name, field }) => ({ name, field: enrichField(name, field) }));
  const clubId = (values["club_id"] as string) || "";

  return (
    <div className="space-y-4">
      {fields.map(({ name, field }) => (
        <Field key={name} name={name} field={field} error={errorFor(name)?.message}>
          {renderWidget({ name, field, value: values[name], set, clubId, invalid: Boolean(errorFor(name)) })}
        </Field>
      ))}

      {errors.length > 0 && (
        <div className="flex items-center justify-end border-t border-white/5 pt-3">
          <span className="text-[11px] text-red-400">
            {errors.length} field{errors.length > 1 ? "s" : ""} need attention
          </span>
        </div>
      )}
    </div>
  );
}

function Field({
  name,
  field,
  error,
  children,
}: {
  name: string;
  field: FieldSchema;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-0.5 block text-sm font-medium text-neutral-200">
        {field.title ?? name}
      </label>
      {field.description && (
        <p className="mb-1.5 text-[11px] leading-relaxed text-neutral-400">{field.description}</p>
      )}
      {children}
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

function renderWidget({
  name,
  field,
  value,
  set,
  clubId,
  invalid,
}: {
  name: string;
  field: FieldSchema;
  value: unknown;
  set: (name: string, v: unknown) => void;
  clubId: string;
  invalid: boolean;
}): React.ReactNode {
  const ref = field["x-ref"];
  const unit = field["x-unit"];
  const widget = field["x-widget"];
  const placeholder = field["x-placeholder"] ?? "";

  // Entity pickers (P0-1) — bound to live data.
  if (ref === "club") {
    return <ClubPicker id={name} value={(value as string) ?? ""} onChange={(v) => set(name, v)} invalid={invalid} />;
  }
  if (ref === "user") {
    return (
      <UserPicker
        id={name}
        value={(value as string) ?? ""}
        clubId={clubId}
        onChange={(v) => set(name, v)}
        invalid={invalid}
      />
    );
  }
  if (ref === "tournament") {
    return <TournamentPicker id={name} value={(value as string) ?? ""} onChange={(v) => set(name, v)} invalid={invalid} />;
  }

  // Card fields → 52-card visual picker (single group or one-per-player).
  if (widget === "cards") {
    return <CardField label="" value={(value as string) ?? ""} max={field["x-max"] ?? 5} onChange={(v) => set(name, v)} />;
  }
  if (widget === "hands") {
    return (
      <HandsField
        value={Array.isArray(value) ? (value as string[]) : []}
        cardsPerHand={field["x-max"] ?? 2}
        label={name.includes("villain") ? "Opponent" : "Player"}
        onChange={(v) => set(name, v)}
      />
    );
  }

  // Sliders → bounded numbers and percents.
  if (widget === "slider") {
    return (
      <SliderInput
        id={name}
        value={Number(value) || field.minimum || 0}
        onChange={(v) => set(name, v)}
        min={field.minimum ?? 0}
        max={field.maximum ?? 100}
        step={field.step ?? 1}
        unit={unit}
        invalid={invalid}
      />
    );
  }

  // Money / basis points (P0-2).
  if (unit === "money_minor") {
    return (
      <MoneyInput
        id={name}
        value={Number(value) || 0}
        onChange={(minor) => set(name, minor)}
        min={field.minimum}
        max={field.maximum}
        invalid={invalid}
      />
    );
  }
  if (unit === "bps") {
    return (
      <BasisPointsInput
        id={name}
        value={Number(value) || 0}
        onChange={(bps) => set(name, bps)}
        min={field.minimum}
        max={field.maximum}
        invalid={invalid}
        suffixHint={name.includes("payout") ? "of prize pool" : name.includes("equity") ? "equity" : "rake"}
      />
    );
  }

  // Enums -> select.
  if (field.enum && field.enum.length > 0) {
    return (
      <select
        id={name}
        value={(value as string) ?? ""}
        onChange={(e) => set(name, e.target.value)}
        className={`${FIELD} ${invalid ? "border-brand/60" : ""}`}
      >
        {field.enum.map((opt) => (
          <option key={opt} value={opt} className="bg-neutral-900 text-white">
            {opt}
          </option>
        ))}
      </select>
    );
  }

  // Booleans -> toggle.
  if (field.type === "boolean") {
    const on = Boolean(value);
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => set(name, !on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          on ? "bg-gold" : "bg-white/15"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    );
  }

  // Integer / number with unit suffix.
  if (field.type === "integer" || field.type === "number") {
    const suffix =
      unit === "seconds" ? "sec" : unit === "minutes" ? "min" : unit === "count" ? "" : "";
    return (
      <div className="relative">
        <input
          id={name}
          type="number"
          value={value === 0 || value ? String(value) : ""}
          min={field.minimum}
          max={field.maximum}
          onChange={(e) => set(name, e.target.value === "" ? 0 : Number(e.target.value))}
          className={`${FIELD} ${suffix ? "pr-12" : ""} ${invalid ? "border-brand/60" : ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
            {suffix}
          </span>
        )}
      </div>
    );
  }

  // Strings, dates.
  return (
    <input
      id={name}
      type={field.format === "date-time" ? "datetime-local" : "text"}
      value={(value as string) ?? ""}
      placeholder={placeholder}
      onChange={(e) => set(name, e.target.value)}
      className={`${FIELD} ${invalid ? "border-brand/60" : ""}`}
    />
  );
}
