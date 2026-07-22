import { isRequired, orderedFields, type RpcSchema } from "./schemaTypes";

export interface FieldError {
  field: string;
  message: string;
}

/** Validate form values against the generated schema (client-side mirror of the
 * server contract). The backend still enforces everything; this is for fast,
 * friendly feedback before submit. */
export function validate(schema: RpcSchema, values: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  for (const { name, field } of orderedFields(schema)) {
    const v = values[name];
    const required = isRequired(schema, name);
    const empty = v === undefined || v === null || v === "";

    if (required && empty) {
      errors.push({ field: name, message: `${field.title ?? name} is required` });
      continue;
    }
    if (empty) continue;

    if (field.type === "integer" || field.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) {
        errors.push({ field: name, message: `${field.title ?? name} must be a number` });
        continue;
      }
      if (field.minimum != null && n < field.minimum) {
        errors.push({ field: name, message: `${field.title ?? name} is below the minimum` });
      }
      if (field.maximum != null && n > field.maximum) {
        errors.push({ field: name, message: `${field.title ?? name} is above the maximum` });
      }
    }
    if (field.type === "string" && typeof v === "string") {
      if (field.minLength != null && v.length < field.minLength) {
        errors.push({ field: name, message: `${field.title ?? name} is too short` });
      }
      if (field.maxLength != null && v.length > field.maxLength) {
        errors.push({ field: name, message: `${field.title ?? name} is too long` });
      }
      if (field.enum && field.enum.length > 0 && !field.enum.includes(v)) {
        errors.push({ field: name, message: `${field.title ?? name} is not a valid option` });
      }
    }
  }
  return errors;
}

/** Build the initial values for a form: schema example merged with overrides. */
export function initialValues(
  schema: RpcSchema,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  const example = schema.examples?.[0] ?? {};
  for (const { name, field } of orderedFields(schema)) {
    if (name in example) base[name] = example[name];
    else if (field.type === "boolean") base[name] = false;
    else if (field.type === "integer" || field.type === "number") base[name] = 0;
    else base[name] = "";
  }
  return { ...base, ...overrides };
}
