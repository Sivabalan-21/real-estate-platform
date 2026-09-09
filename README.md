

\## Getting Started (Docker)



```bash

cp .env.example .env

\# fill in the values in .env

docker compose up --build

```



\- Backend: http://localhost:8000

\- Frontend: http://localhost:3000

\- Database migrations run automatically on backend startup.

## Seeding demo data

To populate the database with a complete demo dataset (1 company, 7 users, 2 properties, 8 units, 3 leases, 4 tickets):

    docker compose exec backend python seed.py

Safe to run multiple times — existing records are skipped, not duplicated.

To wipe and recreate all seed data from scratch:

    docker compose exec backend python seed.py --reset

All seeded users share the password: `Test1234!`