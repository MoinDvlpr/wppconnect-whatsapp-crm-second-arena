import { describe, expect, it } from "vitest";
import { extractVariables, renderTemplate, validateTemplateBody, TemplateRenderError, contactToVariables } from "@/lib/template";

describe("template renderer", () => {
  it("renders contact + campaign variables", () => {
    const r = renderTemplate("Hello {{first_name}}, your order {{order_id}} is ready.", { contact: { first_name: "Mayudin" }, campaign: { order_id: "ORD-1001" } });
    expect(r.text).toBe("Hello Mayudin, your order ORD-1001 is ready."); expect(r.missing).toEqual([]);
  });
  it("reports missing variables explicitly and never leaves {{ }}", () => {
    const r = renderTemplate("Hi {{unknown_variable}}", { contact: {} });
    expect(r.missing).toEqual(["unknown_variable"]); expect(r.text).not.toContain("{{");
    expect(() => renderTemplate("Hi {{x}}", {}, { strict: true })).toThrow(TemplateRenderError);
  });
  it("campaign data overrides contact data", () => { expect(renderTemplate("{{company}}", { contact: { company: "A" }, campaign: { company: "B" } }).text).toBe("B"); });
  it("extracts and validates variables", () => {
    expect(extractVariables("{{a}} {{ b }} {{a}}")).toEqual(["a", "b"]);
    expect(validateTemplateBody("")).toContain("Body cannot be empty");
    expect(validateTemplateBody("{{a}")).toContain("Unbalanced {{ }} braces");
    expect(validateTemplateBody("{{bad name}}").length).toBeGreaterThan(0);
  });
  it("derives first name from display name", () => { expect(contactToVariables({ name: "Jane Doe" }).first_name).toBe("Jane"); expect(contactToVariables({ name: "Jane Doe" }).last_name).toBe("Doe"); });
});
