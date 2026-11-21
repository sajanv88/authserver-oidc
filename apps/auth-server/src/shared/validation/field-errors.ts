import * as v from "valibot";

/** One message per field: the first problem found with it, for its FieldError. */
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export type ParseResult<Output, Field extends string> =
  | { ok: true; value: Output }
  | { ok: false; errors: FieldErrors<Field> };

/**
 * Parses form values against an object schema, returning the typed output or a message per
 * field. Keys of the schema are the form's field names.
 */
export function parseForm<
  const Schema extends v.ObjectSchema<v.ObjectEntries, v.ErrorMessage<v.ObjectIssue> | undefined>,
>(
  schema: Schema,
  values: unknown,
): ParseResult<v.InferOutput<Schema>, Extract<keyof Schema["entries"], string>> {
  const result = v.safeParse(schema, values);
  if (result.success) return { ok: true, value: result.output };
  const errors: Record<string, string> = {};
  for (const issue of result.issues) {
    const key = issue.path?.[0]?.key;
    if (typeof key === "string" && !(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors: errors as FieldErrors<Extract<keyof Schema["entries"], string>> };
}

/** The first field in `order` that has an error, to move focus to after a failed submit. */
export function firstInvalidField<Field extends string>(
  errors: FieldErrors<Field>,
  order: readonly Field[],
): Field | undefined {
  return order.find((field) => errors[field] !== undefined);
}
