# Update Guide

Read the [changelog](/changelog) before choosing a target version and review its migration notes. The dashboard overview shows your running version.

## Back up

Stop the container before copying the complete data directory and Compose file. If your older deployment uses `.env`, save it too. Back up local storage separately if it is outside `data`, and back up S3 or OpenList files in their storage service.

```bash
docker compose stop chronoframe
mkdir -p backups
cp -a data "backups/data-$(date +%Y%m%d-%H%M%S)"
cp docker-compose.yml backups/docker-compose.yml
```

## Replace the image

Change the image tag in Compose to the version you want, for example `v1.0.0`, then run:

```bash
docker compose pull chronoframe
docker compose up -d chronoframe
docker compose logs -f chronoframe
```

Database migrations run automatically at startup. Manual migration commands are normally unnecessary. The current runtime image has no shell or package manager, so older instructions using `docker exec ... sh` or `npx drizzle-kit migrate` inside the container do not apply.

For a `docker run` deployment, stop and remove the old container, then recreate it with the new tag and the same data mount. Preserve your ports, networks and any deployment environment variables you still need.

## From v0.14.1 to 1.0.0

- Use `v1.0.0` to pin this release or `latest` to follow stable releases.
- Keep your old environment variables during the first upgrade so the application can migrate recognized settings and storage schemes. Verify site details, maps, login and storage in the dashboard before cleaning up `.env`.
- 1.0.0 fixes settings being overwritten on restart; dashboard settings remain in effect.
- If setup appears after upgrading, use the existing administrator email and confirm the original storage path. Check the data mount and startup logs before proceeding; do not create an empty replacement data directory.
- Preserve the session secret, database and storage paths. Deployment options such as proxy trust still belong in the runtime environment.

## Check the result

Sign in, open several existing photos, upload a photo and check albums, maps and the task queue. 1.0.0 adds access restrictions for photos in hidden albums; check your public gallery after upgrading.

## Roll back

Migrations may change the database schema. To roll back, stop the new container, restore the complete backup from before the upgrade and start the original image tag. Downgrading only the image while retaining a migrated database is not a reliable rollback.
