// Types for the generated JSON Schema bundle (backend-core/cmd/schemagen).
// These mirror the Draft-07 subset the reflector emits plus our x-* extensions.

export type JsonType = "string" | "integer" | "number" | "boolean" | "object";

export type FieldUnit =
  | "money_minor"
  | "bps"
  | "percent"
  | "count"
  | "seconds"
  | "minutes";

export type EntityRef = "club" | "user" | "tournament";

export interface FieldSchema {
  title?: string;
  description?: string;
  type: JsonType;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  default?: unknown;
  "x-unit"?: FieldUnit;
  "x-ref"?: EntityRef;
  "x-order"?: number;
}

export interface RpcSchema {
  $schema?: string;
  title?: string;
  description?: string;
  type: "object";
  properties: Record<string, FieldSchema>;
  required?: string[];
  examples?: Record<string, unknown>[];
  additionalProperties?: boolean;
  "x-rpc": string;
}

/** Fields ordered by x-order (the struct field order) for stable form layout. */
export function orderedFields(
  schema: RpcSchema,
): Array<{ name: string; field: FieldSchema }> {
  return Object.entries(schema.properties)
    .map(([name, field]) => ({ name, field }))
    .sort((a, b) => (a.field["x-order"] ?? 0) - (b.field["x-order"] ?? 0));
}

export function isRequired(schema: RpcSchema, name: string): boolean {
  return (schema.required ?? []).includes(name);
}
