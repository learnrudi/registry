export async function upsertOrganization(client, input) {
  const result = await client.query(
    `
      insert into organizations (
        external_auth_provider,
        external_auth_subject,
        name,
        slug,
        metadata
      )
      values ($1, $2, $3, $4, $5)
      on conflict (external_auth_provider, external_auth_subject)
      do update set
        name = excluded.name,
        slug = excluded.slug,
        metadata = organizations.metadata || excluded.metadata
      returning id, external_auth_provider, external_auth_subject, name, slug
    `,
    [
      input.externalAuthProvider,
      input.externalAuthSubject,
      input.name,
      input.slug,
      input.metadata ?? {},
    ],
  );

  return result.rows[0];
}

export async function upsertUser(client, input) {
  const result = await client.query(
    `
      insert into users (
        organization_id,
        external_auth_provider,
        external_auth_subject,
        email,
        display_name,
        role,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (organization_id, external_auth_provider, external_auth_subject)
      do update set
        email = excluded.email,
        display_name = excluded.display_name,
        role = excluded.role,
        metadata = users.metadata || excluded.metadata
      returning id, organization_id, email, display_name, role
    `,
    [
      input.organizationId,
      input.externalAuthProvider,
      input.externalAuthSubject,
      input.email,
      input.displayName,
      input.role,
      input.metadata ?? {},
    ],
  );

  return result.rows[0];
}

export async function findOrganizationByExternalSubject(client, input) {
  const result = await client.query(
    `
      select id, external_auth_provider, external_auth_subject, name, slug
      from organizations
      where external_auth_provider = $1
        and external_auth_subject = $2
    `,
    [input.externalAuthProvider, input.externalAuthSubject],
  );

  return result.rows[0] ?? null;
}

export async function findUserByExternalSubject(client, input) {
  const result = await client.query(
    `
      select id, organization_id, email, display_name, role
      from users
      where organization_id = $1
        and external_auth_provider = $2
        and external_auth_subject = $3
    `,
    [
      input.organizationId,
      input.externalAuthProvider,
      input.externalAuthSubject,
    ],
  );

  return result.rows[0] ?? null;
}
