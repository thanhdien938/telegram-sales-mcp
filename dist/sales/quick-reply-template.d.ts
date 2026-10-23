/**
 * Quick-reply templates only ever interpolate a fixed, public set of sales
 * placeholders. Anything else inside `{{ }}` is rejected at save time so a
 * template can never be crafted to leak an unrelated runtime value.
 */
export declare const ALLOWED_TEMPLATE_VARS: readonly ["customer", "route", "date", "fare"];
export type TemplateVar = (typeof ALLOWED_TEMPLATE_VARS)[number];
/** Throws if the template contains anything other than the allowed placeholders. */
export declare function validateTemplateText(text: string): void;
export interface RenderedTemplate {
    readonly finalText: string;
    readonly matchedVars: readonly TemplateVar[];
    readonly missingVars: readonly TemplateVar[];
}
export declare function renderTemplate(text: string, variables: Partial<Record<TemplateVar, string>>): RenderedTemplate;
