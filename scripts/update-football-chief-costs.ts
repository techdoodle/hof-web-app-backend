import { AppDataSource } from '../src/database/data-source';
import { config } from 'dotenv';

// Load environment variables
config();

async function updateFootballChiefCosts() {
  const dataSource = AppDataSource;

  try {
    await dataSource.initialize();
    console.log('✅ Database connection established');

    // Get count before update
    const beforeResult = await dataSource.query(`
      SELECT 
        COUNT(*) as total_matches,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_matches,
        COUNT(CASE WHEN status != 'CANCELLED' THEN 1 END) as non_cancelled_matches,
        COUNT(CASE WHEN status != 'CANCELLED' AND football_chief_cost = 300 THEN 1 END) as already_300
      FROM matches
    `);

    console.log('\n📊 Current state:');
    console.log(`   Total matches: ${beforeResult[0].total_matches}`);
    console.log(`   Cancelled matches (will be excluded): ${beforeResult[0].cancelled_matches}`);
    console.log(`   Non-cancelled matches: ${beforeResult[0].non_cancelled_matches}`);
    console.log(`   Already set to 300: ${beforeResult[0].already_300}`);
    console.log(`   Will be updated: ${parseInt(beforeResult[0].non_cancelled_matches) - parseInt(beforeResult[0].already_300)}`);

    // Perform the update - set to 300 for all non-cancelled matches
    const updateResult = await dataSource.query(`
      UPDATE matches
      SET football_chief_cost = 300
      WHERE status != 'CANCELLED'
    `);

    console.log(`\n✅ Update completed. Rows affected: ${updateResult[1] || 0}`);

    // Get count after update
    const afterResult = await dataSource.query(`
      SELECT 
        COUNT(*) as total_matches,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_matches,
        COUNT(CASE WHEN status != 'CANCELLED' AND football_chief_cost = 300 THEN 1 END) as matches_with_300
      FROM matches
    `);

    console.log('\n📊 After update:');
    console.log(`   Total matches: ${afterResult[0].total_matches}`);
    console.log(`   Cancelled matches (excluded): ${afterResult[0].cancelled_matches}`);
    console.log(`   Non-cancelled matches with cost = 300: ${afterResult[0].matches_with_300}`);

    console.log('\n✅ Script completed successfully!');
  } catch (error) {
    console.error('❌ Error updating football chief costs:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the script
updateFootballChiefCosts();


