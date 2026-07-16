// =============================================================================
// TL Layer — Named Cypher Queries
// =============================================================================
// File: graph-infra/queries/tl-queries.cypher
// Task: TECH-007
// =============================================================================


// ---------------------------------------------------------------------------
// Query: tl_uc_task_context
// Params: $ucId — UseCase.id (e.g. "UC-101")
// Description: Everything needed to generate task files for a UC:
//   UC + ActivitySteps + Forms + Fields + DomainEntities + Attributes +
//   Requirements + SystemRole + Tasks + APIEndpoints.
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
OPTIONAL MATCH (uc)-[:GENERATES]->(t:Task)
OPTIONAL MATCH (t)-[:IMPLEMENTS]->(ep:APIEndpoint)
RETURN uc,
       collect(DISTINCT as_step) AS activity_steps,
       collect(DISTINCT f) AS forms,
       collect(DISTINCT ff) AS form_fields,
       collect(DISTINCT da) AS domain_attributes,
       collect(DISTINCT de) AS domain_entities,
       collect(DISTINCT rq) AS requirements,
       collect(DISTINCT sr) AS roles,
       collect(DISTINCT t) AS tasks,
       collect(DISTINCT ep) AS api_endpoints;


// ---------------------------------------------------------------------------
// Query: tl_wave_tasks
// Params: $waveNum — Wave.number (e.g. 1)
// Description: All tasks in a specific wave with their status and dependencies.
// ---------------------------------------------------------------------------
MATCH (t:Task)-[:IN_WAVE]->(w:Wave {number: $waveNum})
OPTIONAL MATCH (t)-[:DEPENDS_ON]->(dep:Task)
RETURN t.id AS task_id, t.title AS title, t.status AS status,
       collect(dep.id) AS depends_on
ORDER BY t.id;


// ---------------------------------------------------------------------------
// Query: tl_blocked_tasks
// Description: Tasks whose dependencies are not yet "done".
//              These tasks cannot be started.
// ---------------------------------------------------------------------------
MATCH (t:Task)-[:DEPENDS_ON]->(dep:Task)
WHERE dep.status <> 'done'
RETURN t.id AS blocked_task, t.title AS blocked_title, t.status AS blocked_status,
       dep.id AS blocking_task, dep.title AS blocking_title, dep.status AS blocking_status;


// ---------------------------------------------------------------------------
// Query: tl_progress_stats
// Description: Task count grouped by status — overall progress dashboard.
// ---------------------------------------------------------------------------
MATCH (t:Task)
RETURN t.status AS status, count(t) AS count
ORDER BY
  CASE t.status
    WHEN 'done' THEN 1
    WHEN 'in_progress' THEN 2
    WHEN 'todo' THEN 3
    ELSE 4
  END;


// ---------------------------------------------------------------------------
// Query: tl_actionable_tasks
// Description: Tasks whose ALL dependencies are status='done'.
//              These are the tasks that can be started right now.
// ---------------------------------------------------------------------------
MATCH (t:Task)
WHERE t.status IN ['todo', 'pending']
AND NOT EXISTS {
  MATCH (t)-[:DEPENDS_ON]->(dep:Task) WHERE dep.status <> 'done'
}
OPTIONAL MATCH (t)-[:IN_WAVE]->(w:Wave)
RETURN t.id AS task_id, t.title AS title, t.status AS status,
       w.number AS wave, t.priority AS priority
ORDER BY w.number, t.priority;


// ---------------------------------------------------------------------------
// Query: tl_active_wave
// Description: Lowest wave number that still has incomplete tasks.
// ---------------------------------------------------------------------------
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
WHERE t.status <> 'done'
RETURN w.number AS active_wave, count(t) AS remaining_tasks
ORDER BY w.number
LIMIT 1;


// ---------------------------------------------------------------------------
// Query: tl_task_with_uc_context
// Params: $taskId — Task.id
// Description: Task enriched with its UC's entities, forms, and roles
//              for richer status/recommendation output.
// ---------------------------------------------------------------------------
MATCH (t:Task {id: $taskId})
OPTIONAL MATCH (uc:UseCase)-[:GENERATES]->(t)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (f)-[:HAS_FIELD]->(ff:FormField)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
RETURN t, uc,
       collect(DISTINCT f.name) AS form_names,
       collect(DISTINCT de.name) AS entity_names,
       count(DISTINCT as_step) AS step_count;


// ---------------------------------------------------------------------------
// Query: tl_progress_by_wave
// Description: Progress stats per wave with phase breakdown.
// ---------------------------------------------------------------------------
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
RETURN w.number AS wave,
       count(t) AS total,
       count(CASE WHEN t.status = 'done' THEN 1 END) AS done,
       count(CASE WHEN t.status = 'in_progress' THEN 1 END) AS in_progress,
       count(CASE WHEN t.status IN ['todo', 'pending'] THEN 1 END) AS pending,
       CASE WHEN count(t) > 0
         THEN round(100.0 * count(CASE WHEN t.status = 'done' THEN 1 END) / count(t))
         ELSE 0 END AS progress_pct
ORDER BY w.number;


// ---------------------------------------------------------------------------
// Query: tl_phase_progress
// Description: Count tasks by each phase status value.
//              Used by graph_tl_status for detailed phase-level reporting.
// ---------------------------------------------------------------------------
MATCH (t:Task) WHERE t.phase_be IS NOT NULL
RETURN 'be' AS phase, t.phase_be AS status, count(t) AS count
UNION ALL
MATCH (t:Task) WHERE t.phase_fe IS NOT NULL
RETURN 'fe' AS phase, t.phase_fe AS status, count(t) AS count
UNION ALL
MATCH (t:Task) WHERE t.phase_sync IS NOT NULL
RETURN 'sync' AS phase, t.phase_sync AS status, count(t) AS count
UNION ALL
MATCH (t:Task) WHERE t.phase_review_be IS NOT NULL
RETURN 'review_be' AS phase, t.phase_review_be AS status, count(t) AS count
UNION ALL
MATCH (t:Task) WHERE t.phase_review_fe IS NOT NULL
RETURN 'review_fe' AS phase, t.phase_review_fe AS status, count(t) AS count
UNION ALL
MATCH (t:Task) WHERE t.phase_qa IS NOT NULL
RETURN 'qa' AS phase, t.phase_qa AS status, count(t) AS count;


// ---------------------------------------------------------------------------
// Query: tl_task_scoring
// Description: Composite scoring for next-task recommendation.
//              Factors: priority, wave, dependency satisfaction, phase progress.
// ---------------------------------------------------------------------------
MATCH (t:Task)-[:IN_WAVE]->(w:Wave)
WHERE t.status IN ['todo', 'pending']
AND NOT EXISTS {
  MATCH (t)-[:DEPENDS_ON]->(dep:Task) WHERE dep.status <> 'done'
}
WITH t, w,
     CASE t.priority
       WHEN 'critical' THEN 40
       WHEN 'high' THEN 30
       WHEN 'medium' THEN 20
       WHEN 'low' THEN 10
       ELSE 15
     END AS priority_score,
     CASE WHEN w.number = 0 THEN 20 ELSE 10.0 / w.number END AS wave_score
OPTIONAL MATCH (other:Task)-[:DEPENDS_ON]->(t) WHERE other.status <> 'done'
WITH t, w, priority_score, wave_score,
     count(other) AS blocks_count
RETURN t.id AS task_id, t.title AS title, w.number AS wave,
       t.priority AS priority,
       priority_score + wave_score + (blocks_count * 5) AS total_score
ORDER BY total_score DESC
LIMIT 5;
