// One `it(` call, assertion is only `toBeDefined()`. No required-field
// assertion exists. Pre-W10 scanner sees: non-empty test file, no
// empty-describe block → no flag fires. W10 sees: no runtime sample
// usable for shape-validation (sources b is too weak; a, c, d are
// absent) → shape-unvalidated.

import { describe, it, expect } from "vitest";
import { listWorkflowSteps } from "./workflow-steps.service";

describe("WorkflowStepsService", () => {
  it("returns a value", () => {
    expect(listWorkflowSteps()).toBeDefined();
  });
});
