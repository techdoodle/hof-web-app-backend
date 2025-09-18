const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

require('dotenv').config({ path: './staging.env' });

async function deployToStaging() {
  console.log('🚀 Starting staging deployment...');
  
  try {
    // Step 1: Build the application
    console.log('📦 Building application...');
    await execAsync('npm run build');
    console.log('✅ Build completed');

    // Step 2: Run migrations
    console.log('🗄️  Running database migrations...');
    await execAsync('npm run migration:run');
    console.log('✅ Migrations completed');

    // Step 3: Start the application (in production, this would be handled by your deployment platform)
    console.log('🎯 Staging deployment completed successfully!');
    console.log('💡 Remember to restart your staging server to apply changes');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

deployToStaging();
