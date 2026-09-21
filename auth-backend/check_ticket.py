import psycopg2
conn = psycopg2.connect("postgresql://postgres:siva21@127.0.0.1:5432/auth_db")
cur = conn.cursor()
cur.execute("""
    SELECT mt.id, mt.title, mt.status, mt.unit_id
    FROM maintenance_tickets mt
    JOIN units u ON mt.unit_id = u.id
    WHERE u.unit_number = 'MAP-204'
""")
for row in cur.fetchall():
    print(row)
