# Organization context skills

This suite supplies portable entrypoints for an organization's existing business
knowledge. The Registry distributes the workflows and an unconfigured source-map
template. Each organization keeps its own records, permissions, provider bindings,
and workspace layout. Installing a skill does not disclose those records to the
Registry or connect an account.

## Start with one entrypoint

After these packages are available in your selected Registry:

```bash
rudi install skill:business --sync-skills=codex,claude
```

Then request `$business setup` and identify the organization and its existing
workspace. The skill reads the workspace's instructions and can prepare a local
`ORGANIZATION.md` source map when requested. The map is Markdown interpreted by
the agent; it is not a new runtime configuration format or an access-control
service. Existing organizational conventions take precedence.

`$business brief` uses the selected organization's records with source links and
coverage. Optional domain skills provide more specific guidance; each is usable
without installing the others. The router can still give a bounded local brief
when a companion skill is absent, using the domain's own instructions.

To install the current suite explicitly:

```bash
for skill in business company finance legal-and-corporate operations \
  content-and-brand education-and-programs growth-and-revenue \
  product-and-technology research-and-intelligence; do
  rudi install "skill:$skill" --sync-skills=codex,claude || break
done
```

Use `rudi search --all --skills --domain=organizational-context` for discovery.
Other supported agent hosts may be selected with the CLI's current sync options.
Host-native invocation gestures vary; the skill name remains stable.

## What the source map captures

- The organization, workspace roots, source owners, and applicable instructions.
- The authority for each business area, including whether it is local source,
  an approved document system, or an already adopted service.
- Client/engagement ownership boundaries and known gaps.
- Optional provider identities and available operators, without credentials.
- The other workstation's root and the organization's synchronization policy.

The suggested vocabulary has six business areas. Finance, legal and corporate,
and operations sit within Company conceptually; an existing organization can
map those areas to its own folders and systems. No folder move, schema migration,
data import, or schedule activation happens during installation.

## Filesystem today, services when adopted

An existing filesystem workspace is sufficient to start. Business decisions,
procedures, source documents, and open work can be read through normal file tools.
Canonical financial transactions, signed documents, correspondence, and calendars
retain their own source authority; a local folder is not a universal ledger.

A future domain service can keep operational records in PostgreSQL and expose
authenticated tools. Adoption changes that domain's source binding after a
verified cutover. The same skill name can then use those tools. This suite
does not implement that API, enforce tenant permissions, or make a database live.

## Existing private skills and two workstations

Compare any installed skill with the same name before adoption, especially a
specialized Finance entrypoint. Preserve local account rules and source ownership;
do not use a forced install or sync to discard private customizations. Follow
the CLI's ownership/conflict handling and record deliberate changes to the
organization's source map or private guidance. Keep private data outside the
public package.

Install matching accepted versions on each workstation and resolve each host's
own workspace path. Skill equality does not establish record equality. Follow
the organization's normal source synchronization and service-access policy;
never copy credentials, databases, caches, or whole home/workspace trees to make
an installation look aligned.

## Verification scope

Registry compilation and installation validate package structure and resource
delivery. They do not establish connector access, source freshness, or successful
execution of a real organization's procedures. First use should verify a bounded
read with source links. Additional automation, publication, and provider writes
remain separately authorized work.
