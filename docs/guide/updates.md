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

When upgrading to OG Image v7 across multiple replicas, stop every replica and set the same app secret on every replica before bringing any upgraded instance online. See [OG image signing](#og-image-signing).

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

OG Image v7 uses `NUXT_APP_SECRET` (or `NITRO_APP_SECRET` when set). All v6 signed image URLs become invalid, even when the secret is unchanged. This change requires no database migration.

1. Stop every replica that will serve the upgraded image.
2. Generate one secret of at least 32 characters and set the same value on every replica as `NUXT_APP_SECRET` (or `NITRO_APP_SECRET`).
3. If you prefer to keep an existing `NUXT_OG_IMAGE_SECRET`, rename it only when you can keep its effective value unchanged; if unsure, generate a new secret instead.
4. Bring upgraded replicas online together, refresh cached HTML that contains OG image URLs, then check gallery and public-photo share previews.
5. To roll back, stop every v7 replica before any v6 instance serves traffic, restore the previous image tag and environment configuration, then refresh affected HTML again.

::: tip
If the legacy value is JSON-quoted or contains Compose-special characters, prefer generating a new secret.
:::

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
