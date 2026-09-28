import psycopg2
conn = psycopg2.connect("postgresql://postgres:siva21@127.0.0.1:5432/auth_db")
cur = conn.cursor()
cur.execute("SELECT username, email, status, reset_token FROM users WHERE email = 'vendor@acme.com'")
print(cur.fetchall())