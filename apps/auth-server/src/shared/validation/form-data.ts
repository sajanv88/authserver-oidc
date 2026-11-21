// Reading a submitted form on the server. Everything in FormData is attacker-controlled: these
// only take strings out of it; the feature's valibot schema decides what they mean.

/** A field's text, or "" when it's missing or a file. */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Several fields' text, to send back so a failed attempt keeps what was typed (never passwords). */
export function texts<const Name extends string>(
  formData: FormData,
  names: readonly Name[],
): Record<Name, string> {
  return Object.fromEntries(names.map((name) => [name, text(formData, name)])) as Record<
    Name,
    string
  >;
}

/** A form's fields as an object for `parseForm`: strings only, last value wins. */
export function fieldsOf(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of formData) {
    if (typeof value === "string") fields[name] = value;
  }
  return fields;
}
