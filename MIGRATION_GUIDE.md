# Database Migration Management Guide

## Overview

This project now uses a proper TypeORM migration system to ensure database consistency across staging and production environments.

## Key Changes

### ✅ What's Fixed
- **No more `synchronize: true` in production** - prevents accidental schema changes
- **Automated migration tracking** - TypeORM tracks which migrations have been applied
- **Environment-specific behavior** - different settings for dev, staging, and production
- **Rollback capability** - ability to revert migrations if needed
- **Automated deployment** - migrations run automatically during deployment

### 🔧 Configuration

#### Environment Variables
- **Development**: `NODE_ENV=development` - Uses synchronize for rapid development
- **Staging**: `NODE_ENV=staging` - Uses migrations, allows some logging
- **Production**: `NODE_ENV=production` - Uses migrations, minimal logging

#### Database Behavior by Environment
```typescript
// Development
synchronize: true          // Auto-sync entities with DB schema
migrationsRun: false      // Don't run migrations (using sync instead)
logging: ['query', 'error'] // Detailed logging

// Staging & Production  
synchronize: false         // No auto-sync (safety first!)
migrationsRun: true       // Run migrations on startup
logging: ['error']        // Error logging only
```

## Migration Commands

### Creating New Migrations

```bash
# Generate migration from entity changes
npm run migration:generate src/database/migrations/YourMigrationName

# Create empty migration file
npm run migration:create src/database/migrations/YourMigrationName
```

### Running Migrations

```bash
# Run all pending migrations
npm run migration:run

# Show migration status
npm run migration:show

# Rollback last migration
npm run migration:revert
```

### Deployment Commands

```bash
# Deploy to staging (includes migrations)
npm run deploy:staging

# Deploy to production (includes migrations)
npm run deploy:production

# Manual database operations
npm run db:migrate    # Run migrations
npm run db:rollback   # Rollback last migration
```

## Workflow for Schema Changes

### 1. Development
```bash
# Make changes to your entities
# The app will auto-sync in development

# When ready for staging, generate migration:
npm run migration:generate src/database/migrations/AddNewFeature

# Review the generated migration file
# Edit if necessary (add custom logic, data transformations, etc.)
```

### 2. Staging Deployment
```bash
# Push to dev branch - triggers automatic staging deployment
git push origin dev

# Or deploy manually:
npm run deploy:staging
```

### 3. Production Deployment
```bash
# Merge dev to main branch - triggers automatic production deployment
git checkout main
git merge dev
git push origin main

# Or deploy manually:
npm run deploy:production
```

## Migration File Structure

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class YourMigrationName1734567890001 implements MigrationInterface {
    name = 'YourMigrationName1734567890001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Forward migration logic
        await queryRunner.query(`CREATE TABLE ...`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reverse migration logic
        await queryRunner.query(`DROP TABLE ...`);
    }
}
```

## Automated Deployment (GitHub Actions)

### Triggers
- **Staging**: Push to `dev` branch
- **Production**: Push to `main` branch
- **Manual**: Use "Actions" tab in GitHub

### Required Secrets
Set these in your GitHub repository settings:

```
# Database URLs
STAGING_DB_URL
PRODUCTION_DB_URL

# Railway tokens (if using Railway)
RAILWAY_STAGING_TOKEN
RAILWAY_PRODUCTION_TOKEN
RAILWAY_STAGING_PROJECT_ID
RAILWAY_PRODUCTION_PROJECT_ID
RAILWAY_STAGING_SERVICE_NAME
RAILWAY_PRODUCTION_SERVICE_NAME
```

### Deployment Flow
1. **Code push** triggers workflow
2. **Dependencies** are installed
3. **Application** is built
4. **Migrations** are executed
5. **Application** is deployed
6. **Verification** checks run

## Safety Features

### Production Safeguards
- **Migration preview** - Shows pending migrations before applying
- **Backup reminder** - Prompts to ensure backups are created
- **Status verification** - Confirms migration status after completion
- **Error handling** - Fails deployment if migrations fail

### Rollback Options
```bash
# Rollback last migration in production
npm run db:rollback

# Or use GitHub Actions workflow_dispatch for rollback
```

## Troubleshooting

### Migration Conflicts
```bash
# Check current migration status
npm run migration:show

# If you have conflicts, you may need to:
# 1. Rollback problematic migration
npm run migration:revert

# 2. Fix the migration file
# 3. Re-run migrations
npm run migration:run
```

### Environment Issues
```bash
# Verify environment variables
echo $NODE_ENV
echo $DB_URL

# Check TypeORM configuration
npm run migration:show
```

### Database State Mismatch
If your databases are out of sync:

1. **Don't panic** - this system prevents most issues
2. **Check migration status** on both environments
3. **Use the rollback capability** if needed
4. **Contact the team** for coordination

## Best Practices

### 📝 Migration Writing
- **Always test** migrations in development first
- **Include rollback logic** in down() method
- **Use IF EXISTS/IF NOT EXISTS** for safety
- **Add comments** explaining complex changes
- **Keep migrations atomic** - one logical change per migration

### 🚀 Deployment
- **Always deploy to staging first**
- **Coordinate with team** for production deployments
- **Monitor application** after deployment
- **Have rollback plan** ready

### 🔍 Monitoring
- **Check logs** after deployments
- **Verify application functionality**
- **Monitor database performance**
- **Watch for error alerts**

## Migration History

The following migrations have been converted from SQL to TypeORM:

1. `1734567890001-CreateFootballTeamsTable.ts` - Creates football_teams table
2. `1734567890002-AddMissingStatsColumns.ts` - Adds stats columns
3. `1734567890003-FixTimestampTimezone.ts` - Fixes timezone issues
4. `1734567890004-UpdateTeamSideToTeamName.ts` - Renames team_side to team_name

## Need Help?

- **Check logs** first: `npm run migration:show`
- **Review this guide** for common solutions
- **Ask the team** in your communication channel
- **Create GitHub issue** for complex problems

---

**Remember**: This system is designed to prevent the database inconsistency issues you experienced before. The automated migration system ensures both staging and production stay in sync! 🎯
