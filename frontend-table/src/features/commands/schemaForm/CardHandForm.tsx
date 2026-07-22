"use client";

import { CardField } from "./CardPicker";

// Which commands take card-notation fields, and how many cards each holds.
// Rendered with the visual CardPicker instead of a raw "AsKh" textarea (P1-6).
export interface CardFieldSpec {
  key: string;
  label: string;
  max: number;
}

export const CARD_FORMS: Record<string, CardFieldSpec[]> = {
  hand_rank: [{ key: "cards", label: "Cards", max: 7 }],
  omaha_rank: [
    { key: "hole", label: "Hole cards", max: 4 },
    { key: "board", label: "Board", max: 5 },
  ],
  gto_advise: [
    { key: "hero_hole", label: "Your hand", max: 2 },
    { key: "board", label: "Board (optional)", max: 5 },
  ],
};

export function hasCardForm(commandId: string): boolean {
  return commandId in CARD_FORMS;
}

export function CardHandForm({
  commandId,
  values,
  onChange,
}: {
  commandId: string;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const spec = CARD_FORMS[commandId] ?? [];
  return (
    <div className="space-y-4">
      {spec.map((f) => (
        <CardField
          key={f.key}
          label={f.label}
          max={f.max}
          value={(values[f.key] as string) ?? ""}
          onChange={(v) => onChange({ ...values, [f.key]: v })}
        />
      ))}
    </div>
  );
}
