import psycopg2
conn = psycopg2.connect("postgresql://postgres:siva21@127.0.0.1:5432/auth_db")
cur = conn.cursor()
cur.execute("SELECT id, unit_number, status FROM units")
for row in cur.fetchall():
    print(row)
