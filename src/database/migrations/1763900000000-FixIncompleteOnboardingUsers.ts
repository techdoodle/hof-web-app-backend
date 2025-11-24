import { MigrationInterface, QueryRunner } from "typeorm";

export class FixIncompleteOnboardingUsers1763900000000 implements MigrationInterface {
    name = 'FixIncompleteOnboardingUsers1763900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Set onboarding_complete to false for users who are marked as complete
        // but have missing mandatory fields

        // This ensures data consistency by unmarking users who shouldn't be marked as complete
        await queryRunner.query(`
      UPDATE users
      SET onboarding_complete = false
      WHERE onboarding_complete = true
      AND (
        first_name IS NULL 
        OR TRIM(first_name) = ''
        OR last_name IS NULL 
        OR TRIM(last_name) = ''
        OR city_id IS NULL
        OR phone_number IS NULL 
        OR TRIM(phone_number) = ''
        OR preferred_team IS NULL
        OR profile_picture IS NULL 
        OR TRIM(profile_picture) = ''
        OR profile_picture = 'undefined'
        OR player_category IS NULL
      )
    `);

        // Log how many users were updated
        const result = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM users
      WHERE onboarding_complete = false
      AND (
        first_name IS NULL 
        OR TRIM(first_name) = ''
        OR last_name IS NULL 
        OR TRIM(last_name) = ''
        OR city_id IS NULL
        OR phone_number IS NULL 
        OR TRIM(phone_number) = ''
        OR preferred_team IS NULL
        OR profile_picture IS NULL 
        OR TRIM(profile_picture) = ''
        OR profile_picture = 'undefined'
        OR player_category IS NULL
      )
    `);

        console.log(`✓ Fixed onboarding status for users with incomplete profiles`);
        console.log(`  Found ${result[0].count} users with incomplete onboarding data`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Note: We cannot reliably reverse this migration as we don't know
        // which users were incorrectly marked as complete before.
        // This is a data cleanup migration and should not be rolled back.
        console.log('⚠ This migration cannot be rolled back as it fixes data inconsistencies');
    }
}

