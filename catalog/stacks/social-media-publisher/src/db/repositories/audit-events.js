export async function recordAuditEvent(client, input) {
  const result = await client.query(
    `
      insert into audit_events (
        organization_id,
        actor_type,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        request_id,
        reason,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning id, organization_id, action, entity_type, entity_id, created_at
    `,
    [
      input.organizationId,
      input.actorType,
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.requestId ?? null,
      input.reason ?? null,
      input.metadata ?? {},
    ],
  );

  return result.rows[0];
}
