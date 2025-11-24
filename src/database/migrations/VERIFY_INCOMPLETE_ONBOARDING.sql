-- Verification Query for Incomplete Onboarding Users
-- Run this BEFORE the migration to see which users will be affected

-- Users marked as onboarding complete but have missing mandatory fields
SELECT 
    id,
    phone_number,
    first_name,
    last_name,
    city_id,
    preferred_team,
    profile_picture,
    player_category,
    onboarding_complete,
    CASE
        WHEN first_name IS NULL OR TRIM(first_name) = '' THEN 'Missing first_name'
        WHEN last_name IS NULL OR TRIM(last_name) = '' THEN 'Missing last_name'
        WHEN city_id IS NULL THEN 'Missing city_id'
        WHEN phone_number IS NULL OR TRIM(phone_number) = '' THEN 'Missing phone_number'
        WHEN preferred_team IS NULL THEN 'Missing preferred_team'
        WHEN profile_picture IS NULL OR TRIM(profile_picture) = '' OR profile_picture = 'undefined' THEN 'Missing profile_picture'
        WHEN player_category IS NULL THEN 'Missing player_category'
        ELSE 'Unknown issue'
    END as missing_field
FROM users
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
ORDER BY id;

-- Count summary
SELECT 
    COUNT(*) as total_affected_users,
    COUNT(CASE WHEN first_name IS NULL OR TRIM(first_name) = '' THEN 1 END) as missing_first_name,
    COUNT(CASE WHEN last_name IS NULL OR TRIM(last_name) = '' THEN 1 END) as missing_last_name,
    COUNT(CASE WHEN city_id IS NULL THEN 1 END) as missing_city,
    COUNT(CASE WHEN phone_number IS NULL OR TRIM(phone_number) = '' THEN 1 END) as missing_phone,
    COUNT(CASE WHEN preferred_team IS NULL THEN 1 END) as missing_team,
    COUNT(CASE WHEN profile_picture IS NULL OR TRIM(profile_picture) = '' OR profile_picture = 'undefined' THEN 1 END) as missing_photo,
    COUNT(CASE WHEN player_category IS NULL THEN 1 END) as missing_category
FROM users
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
);

-- Check all users' onboarding status
SELECT 
    onboarding_complete,
    COUNT(*) as user_count
FROM users
GROUP BY onboarding_complete;

