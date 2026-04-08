# Update Guide

This document will guide you through safely updating and upgrading ChronoFrame to the latest version.

## Version Check

### View Current Version

#### Through Web Interface

1. Login to ChronoFrame admin dashboard
2. Go to "Dashboard" page
3. Check version number in "Runtime Information" panel

## Update Process

### Preparation

#### 1. Data Backup

```bash
# Stop service
docker-compose down

# Create complete backup
ts=$(date +%Y%m%d-%H%M%S) && mkdir -p backups/$ts && cp -r data/ .env docker-compose.yml backups/$ts/
```

#### 2. Check Compatibility

Review [Release Notes](https://github.com/HoshinoSuzumi/chronoframe/releases) to understand:

- Breaking changes
- New environment variables
- Feature deprecation notices

### Docker Compose Update (Recommended)

#### Standard Update Process

```bash
# 1. Enter project directory
cd /path/to/chronoframe

# 2. Backup current configuration
cp docker-compose.yml docker-compose.yml.backup

# 3. Stop current service
docker-compose down

# 4. Pull latest image
docker-compose pull

# 5. Start new version
docker-compose up -d

# 6. View startup logs
docker-compose logs -f chronoframe
```

#### Specific Version Update

If you need to update to a specific version:

```yaml
# docker-compose.yml
services:
  chronoframe:
    image: ghcr.io/hoshinosuzumi/chronoframe:v1.2.3 # Specify version
    # ... other configurations
```

```bash
docker-compose up -d
```

### Single Container Update

```bash
# Stop existing container
docker stop chronoframe
docker rm chronoframe

# Pull latest image
docker pull ghcr.io/hoshinosuzumi/chronoframe:latest

# Start new container with same configuration
docker run -d \
  --name chronoframe \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  ghcr.io/hoshinosuzumi/chronoframe:latest
```

## Database Migration

### Automatic Migration

ChronoFrame automatically executes database migrations on startup:

```bash
# View migration logs
docker logs chronoframe | grep -i migration
```

### Manual Migration (Advanced)

In special cases, you may need to manually execute migrations:

```bash
# Enter container
docker exec -it chronoframe sh

# Execute migration
npx drizzle-kit migrate
```
