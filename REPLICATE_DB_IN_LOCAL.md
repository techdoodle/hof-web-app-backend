## Overview
Replicating Prod/Stg DB in local postgres to replicate

## Setup Steps

1. **DROP DATABASE (IF EXISTS)**
    -psql -h localhost -U postgres -c "DROP DATABASE hof;"    
    -psql -h localhost -U postgres -c "DROP DATABASE hof WITH (FORCE);" (if above doesnt work)    

2. **Create DABATABASE hof**
   -  psql -h localhost -U postgres -c "CREATE DATABASE hof;"

3. **Change DB_URL in .env file**
   - DB_URL=postgresql://postgres:password@localhost:5432/hof?sslmode=disable

4. **RUn command in Powershell/cmd**
   - pg_dump -h pg_host -p pg_port -U user_name -d db_name --no-owner -W | psql -h localhost -U postgres -d hof