from werkzeug.security import check_password_hash
import psycopg2

secret_to_test = "capprice-local-secret-123"

try:
    conn = psycopg2.connect(
        user='capssys_app', 
        password='SsySSaaS-CAP2025proX', 
        host='localhost', 
        port=5432, 
        dbname='capssys_bd'
    )
    conn.set_client_encoding('UTF8')
    with conn.cursor() as cur:
        cur.execute("SELECT client_secret_hash FROM cs_app.tb_sso_client WHERE client_id = 'capprice'")
        row = cur.fetchone()
        if row:
            hash_in_db = row[0]
            matches = check_password_hash(hash_in_db, secret_to_test)
            print(f"Secret: {secret_to_test}")
            print(f"Hash in DB: {hash_in_db}")
            print(f"Matches: {matches}")
        else:
            print("Client 'capprice' not found in DB.")
    conn.close()
except Exception as e:
    # Silent on encoding error if needed, but let's try to grab the hash
    print(f"Error: {e}")
