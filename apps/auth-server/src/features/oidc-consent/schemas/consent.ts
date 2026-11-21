import * as v from "valibot";

/** The two buttons of the consent form, each a submitter with name="decision". */
export const ConsentDecisionSchema = v.object({
  decision: v.picklist(["allow", "deny"], "Choose Allow or Deny."),
});

export type ConsentDecision = v.InferOutput<typeof ConsentDecisionSchema>["decision"];
