# Update Guide

Read the [changelog](/changelog) before choosing a target version and review its migration notes. The dashboard overview shows your running version.

<DocStep number="1" label="Back up">

## Back up

::: warning Stop and back up first
Stop every replica that shares the data directory—including any outside this Compose project—then back up:

- The complete data directory and Compose file, including `app.sqlite3` and `.session-password`. Include hidden key files, not just the database.
- `.env`, if your older deployment still uses it.
- Local photos outside `data`, plus files in S3 or OpenList.

:::

```bash
docker compose stop chronoframe
mkdir -p backups
cp -a data "backups/data-$(date +%Y%m%d-%H%M%S)"
cp docker-compose.yml backups/docker-compose.yml
```

</DocStep>

<DocStep number="2" label="Update and rollback">

## Replace the image

When upgrading to OG Image v7 across multiple replicas, stop every replica and configure the same valid, nonempty `NUXT_APP_SECRET` (or `NITRO_APP_SECRET`) on every replica before changing the image or bringing any upgraded instance online. Stopping alone does not prevent signing mismatches when replicas retain different secret overrides. Production startup fails without a valid app secret.

Change the image tag in Compose to the version you want, for example `v1.0.0`, then run:

```bash
docker compose pull chronoframe
docker compose up -d chronoframe
docker compose logs -f chronoframe
```

::: info Migrations run at startup
Database migrations run automatically at startup. Manual migration commands are normally unnecessary. The current runtime image has no shell or package manager, so older instructions using `docker exec ... sh` or `npx drizzle-kit migrate` inside the container do not apply.
:::

For a `docker run` deployment, stop and remove the old container, then recreate it with the new tag and the same data mount. Preserve your ports, networks and any deployment environment variables you still need.

## OG image signing

- For v6-to-v6 upgrades, keep `NUXT_OG_IMAGE_SECRET` and its existing value. Renaming it can change the signing secret and break verification of cached image URLs.
- When upgrading to OG Image v7, migrate `NUXT_OG_IMAGE_SECRET` to `NUXT_APP_SECRET` only if neither `NITRO_APP_SECRET` nor `NUXT_APP_SECRET` is already configured. Keep the legacy value if it has at least 32 characters; otherwise generate a new secret of at least 32 characters before upgrading and use it as `NUXT_APP_SECRET`. If both Nuxt variables are configured and `NITRO_APP_SECRET` is unset, `NUXT_APP_SECRET` takes precedence: preserve its value and do not overwrite it with the legacy value. `NITRO_APP_SECRET`, when set, has the highest precedence.
- When migrating the legacy value, define `legacySecret` as the effective v6 secret after environment parsing—not each replica's raw env text. If the Compose value is an expression such as `${LEGACY_SECRET}`, resolve it to the value that reaches the container first; copying the expression literally produces `"${LEGACY_SECRET}"`, which fails the 32-character check and is not the real secret. Derive the effective secret with v6's `destr` parsing semantics on that container value (the same parser Nitro used for runtime config)—not `JSON.parse` with a raw-value fallback, which can disagree on values such as `true`, `null`, or JSON arrays. Take the `destr` result when it is a string; do not infer the secret from unparsed env text—representations such as `AAAA...` and `"AAAA..."` produce the same runtime string, and JSON-encoding each raw form would create different v7 secrets and break cross-replica verification. After verifying one shared effective string across replicas, supply the output of `JSON.stringify(legacySecret)` as `NUXT_APP_SECRET` on every replica, including the JSON quotation marks in the actual environment value. This preserves the original string even if it looks like a number or JSON; copying it unquoted can change its type or content. For a plain-string example in Compose, use `NUXT_APP_SECRET: '"<existing-secret>"'`: the outer single quotes are YAML syntax, while the inner double quotes must reach the container. Before YAML and Compose escaping, replace any literal DEL (`U+007F`) in the `JSON.stringify` output with `\u007f`, replace each literal C1 control (`U+0080`–`U+009F`) with the matching `\u00XX` escape, and replace literal `U+FFFE` / `U+FFFF` with `\ufffe` / `\uffff`; Compose rejects those literal characters in the YAML file, while JSON parsing restores the same characters in the container. Within that YAML single-quoted scalar, double each apostrophe in the JSON output (`'` → `''`); YAML restores it to a single apostrophe in the container value. Also double each dollar sign in the JSON output (`$` → `$$`) before placing it in the Compose file, so text such as `$MISSING` stays literal instead of being interpolated by Compose. The decoded secret, excluding the added JSON quotes, must still have at least 32 characters.
- In v7, the legacy name remains a deprecated fallback until you migrate to `NUXT_APP_SECRET`. Production still requires a valid effective app secret at startup.
- Separate from the effective-secret encoding above: if a v7 deployment still relies on the deprecated `NUXT_OG_IMAGE_SECRET` fallback and that value is JSON-quoted, renaming the variable to `NUXT_APP_SECRET` without changing its text changes the signing key—the legacy fallback is read as the raw env string, while `NUXT_APP_SECRET` is JSON-parsed. A raw fallback of 30 letters wrapped in JSON quotes is 32 characters and passes the legacy check, but after a plain rename JSON parsing leaves only 30 characters and startup fails. To keep the same secret the legacy path used, assign `JSON.stringify` of the entire raw fallback string (including its quote characters) as `NUXT_APP_SECRET`, not the unquoted inner text. Coordinate that rename across every replica so they switch together, then refresh cached HTML containing OG image URLs.
- OG Image v7 invalidates v6 signed image URLs even when the app secret is unchanged. Keep public traffic gated throughout the version switch and the cached-HTML purge that follows the coordinated upgrade above; reopen traffic only after that purge is complete, then check gallery and public-photo share previews.
- This SEO change requires no database migration. Keep app secrets stable; invalid or missing explicit app secrets stop production startup instead of silently choosing a new app secret.
- To roll back this change, stop every v7 replica before any v6 instance serves traffic so v6 image URLs cannot reach a still-running v7 replica. Then restore the previous image tag and environment configuration, retain the persistent data volume, and keep public traffic gated while you refresh affected cached HTML again; reopen traffic only after that purge is complete. If other changes in the release migrated the database, follow the backup-restoration steps below.

## From v0.14.1 to 1.0.0

- Use `v1.0.0` to pin this release or `latest` to follow stable releases.
- Keep your old environment variables during the first upgrade so the application can migrate recognized settings and storage schemes. Verify site details, maps, login and storage in the dashboard before cleaning up `.env`.
- 1.0.0 fixes settings being overwritten on restart; dashboard settings remain in effect.
- If setup appears after upgrading, use the existing administrator email and confirm the original storage path. Check the data mount and startup logs before proceeding; do not create an empty replacement data directory.
- Preserve the session secret, database and storage paths. Deployment options such as proxy trust still belong in the runtime environment.

## Roll back

::: danger Restore the database when rolling back
If the upgrade applied database schema migrations, stop the new container, restore the complete backup from before the upgrade and start the original image tag with its previous environment configuration. Downgrading only the image while retaining a migrated database is not a reliable rollback. For the SEO-only change above, preserve the existing data volume and key files when reverting the image and environment.

:::

</DocStep>

<DocStep number="3" label="Check">

## Check the result

Sign in, open several existing photos, upload a photo and check albums, maps and the task queue. 1.0.0 adds access restrictions for photos in hidden albums; check your public gallery after upgrading.

</DocStep>
