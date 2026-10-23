/**
 * Quick-reply templates only ever interpolate a fixed, public set of sales
 * placeholders. Anything else inside `{{ }}` is rejected at save time so a
 * template can never be crafted to leak an unrelated runtime value.
 */
export const ALLOWED_TEMPLATE_VARS = Object.freeze([
  'customer',
  'route',
  'date',
  'fare',
] as const);
export type TemplateVar = (typeof ALLOWED_TEMPLATE_VARS)[number];

const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_]*)\}\}/g;

function isAllowedVar(name: string): name is TemplateVar {
  return (ALLOWED_TEMPLATE_VARS as readonly string[]).includes(name);
}

/** Throws if the template contains anything other than the allowed placeholders. */
export function validateTemplateText(text: string): void {
  const openCount = (text.match(/\{\{/g) ?? []).length;
  const closeCount = (text.match(/\}\}/g) ?? []).length;
  if (openCount !== closeCount) {
    throw new Error('Unbalanced template placeholder braces');
  }
  const matches = [...text.matchAll(PLACEHOLDER_RE)];
  if (matches.length !== openCount) {
    throw new Error('Malformed template placeholder syntax');
  }
  for (const match of matches) {
    const name = match[1] ?? '';
    if (!isAllowedVar(name)) {
      throw new Error(`Unknown template placeholder: ${name || '(empty)'}`);
    }
  }
}

export interface RenderedTemplate {
  readonly finalText: string;
  readonly matchedVars: readonly TemplateVar[];
  readonly missingVars: readonly TemplateVar[];
}

export function renderTemplate(
  text: string,
  variables: Partial<Record<TemplateVar, string>>,
): RenderedTemplate {
  const matchedVars = Array.from(
    new Set(
      [...text.matchAll(PLACEHOLDER_RE)]
        .map((m) => m[1] ?? '')
        .filter(isAllowedVar),
    ),
  );
  const missingVars = matchedVars.filter(
    (name) => variables[name] === undefined,
  );
  const finalText = text.replace(PLACEHOLDER_RE, (_whole, name: string) =>
    isAllowedVar(name) ? (variables[name] ?? '') : '',
  );
  return { finalText, matchedVars, missingVars };
}
