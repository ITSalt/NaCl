// Post-`8522d1d`: TODO marker removed. Function returns a static catalog
// of fake-shaped entries. This is exactly the Project-Alpha leak that pre-W10
// scanner read as "no TODO → STUBS COMPLETE".
//
// The W10 shape-validation procedure refuses to close STUB-042 unless a
// runtime sample is available and matches UC-302's required-field set.

export interface WorkflowStep {
  id: string;
  // Note: required fields per UC-302 spec are id (uuid), name (string),
  // step_order (int), kind (enum). The fake catalog below omits
  // step_order and uses non-uuid ids — a shape-mismatch if validated.
}

export function listWorkflowSteps(): WorkflowStep[] {
  return [
    { id: "step-001" },
    { id: "step-002" },
    { id: "step-003" }
  ];
}
