const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

require('dotenv').config({ path: './production.env' });

async function deployToProduction() {
  console.log('🚀 Starting production deployment...');
  
  try {
    // Step 1: Safety check - show pending migrations
    console.log('🔍 Checking pending migrations...');
    const { stdout: pendingMigrations } = await execAsync('npm run migration:show');
    console.log('Pending migrations:', pendingMigrations);
    
    // Step 2: Build the application
    console.log('📦 Building application...');
    await execAsync('npm run build');
    console.log('✅ Build completed');

    // Step 3: Run migrations with safety checks
    console.log('🗄️  Running database migrations...');
    
    // Create a backup notification (you should integrate with your backup system)
    console.log('⚠️  IMPORTANT: Ensure database backup is created before proceeding');
    console.log('⚠️  This is a production deployment - migrations cannot be easily reverted');
    
    await execAsync('npm run migration:run');
    console.log('✅ Migrations completed');

    // Step 4: Verify deployment
    console.log('🔍 Verifying migration status...');
    const { stdout: migrationStatus } = await execAsync('npm run migration:show');
    console.log('Migration status:', migrationStatus);

    console.log('🎯 Production deployment completed successfully!');
    console.log('💡 Remember to restart your production server to apply changes');
    
  } catch (error) {
    console.error('❌ Production deployment failed:', error.message);
    console.error('🚨 CRITICAL: Check database state and application status immediately!');
    process.exit(1);
  }
}

deployToProduction();
