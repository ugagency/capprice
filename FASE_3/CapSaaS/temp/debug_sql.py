import psycopg2
import sys

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
        cur.execute("SELECT client_id, client_secret_hash, audience, enabled FROM cs_app.tb_sso_client WHERE client_id = 'capprice'")
        row = cur.fetchone()
        print(row)
    conn.close()
except Exception as e:
    print(f'Error: {e}')
