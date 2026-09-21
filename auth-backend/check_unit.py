import psycopg2
conn = psycopg2.connect("postgresql://postgres:siva21@127.0.0.1:5432/auth_db")
cur = conn.cursor()
cur.execute("SELECT id, unit_number, status, pre_maintenance_status FROM units WHERE unit_number = 'MAP-204'")
for row in cur.fetchall():
    print(row)
