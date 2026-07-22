"use client";

import { useMemo, useState } from "react";

import { BasisPointsInput } from "./BasisPointsInput";
import { ClubPicker, UserPicker } from "./EntityPickers";
import { MoneyInput } from "./MoneyInput";
import { orderedFields, type FieldSchema, type RpcSchema } from "./schemaTypes";
import { validate } from "./validate";

const FIELD =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-gold/50 focus:ring-1 focus:ring-gold/30";

/**
 * SchemaForm (UI review P0-1): renders a real, labeled form from a generated
 * RPC schema — pickers for entity refs, MoneyInput/BasisPointsInput for money
 * and rake, selects for enums, toggles for booleans. Raw JSON is available only
 * behind the "Advanced" toggle. One renderer covers every command, so a club
 * owner never edits braces or pastes an internal id.
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
  const [advanced, setAdvanced] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const errors = useMemo(() => validate(schema, values), [schema, values]);
  const errorFor = (name: string) => errors.find((e) => e.field === name);

  const set = (name: string, v: unknown) => onChange({ ...values, [name]: v });

  const fields = orderedFields(schema);
  const clubId = (values["club_id"] as string) || "";

  const openAdvanced = () => {
    setJsonText(JSON.stringify(values, null, 2));
    setJsonError(null);
    setAdvanced(true);
  };

  return (
    <div className="space-y-4">
      {!advanced &&
        fields.map(({ name, field }) => (
          <Field key={name} name={name} field={field} error={errorFor(name)?.message}>
            {renderWidget({ name, field, value: values[name], set, clubId, invalid: Boolean(errorFor(name)) })}
          </Field>
        ))}

      {advanced && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Raw JSON payload (advanced)
          </label>
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              try {
                const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : {};
                setJsonError(null);
                onChange(parsed as Record<string, unknown>);
              } catch (err) {
                setJsonError(err instanceof Error ? err.message : "Invalid JSON");
              }
            }}
            rows={12}
            className="w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-green outline-none focus:border-green/50"
          />
          {jsonError && <p className="mt-1 text-xs text-red-400">{jsonError}</p>}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <button
          type="button"
          onClick={() => (advanced ? setAdvanced(false) : openAdvanced())}
          className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 hover:text-white"
        >
          {advanced ? "← Back to form" : "Advanced: raw JSON"}
        </button>
        {!advanced && errors.length > 0 && (
          <span className="text-[11px] text-red-400">{errors.length} field{errors.length > 1 ? "s" : ""} need attention</span>
        )}
      </div>
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
  const required = false; // required marker handled by parent schema; label shows *
  return (
    <div>
      <label htmlFor={name} className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-neutral-200">
          {field.title ?? name}
        </span>
        {field.description && (
          <span className="text-[10px] text-neutral-500">{field.description}</span>
        )}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
      {required && null}
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

  // Entity pickers (P0-1).
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
    return (
      <input
        id={name}
        value={(value as string) ?? ""}
        onChange={(e) => set(name, e.target.value)}
        placeholder="Tournament id"
        className={`${FIELD} ${invalid ? "border-brand/60" : ""}`}
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
      onChange={(e) => set(name, e.target.value)}
      className={`${FIELD} ${invalid ? "border-brand/60" : ""}`}
    />
  );
}
