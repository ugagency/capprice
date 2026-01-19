import psycopg2
import sys

try:
    conn = psycopg2.connect(
        user='capssys_app', 
        password='SsySSaaSCAP2025proX', 
        host='localhost', 
        port=5432, 
        dbname='capssys_bd'
    )
    cur = conn.cursor()
    cur.execute("SELECT client_id, redirect_url FROM cs_app.tb_sso_client_redirect WHERE enabled = true")
    rows = cur.fetchall()
    print("REDIRECTS_IN_DB:")
    for row in rows:
        print(f"  {row[0]}: {row[1]}")
    conn.close()
except Exception as e:
    print(f"ERROR: {str(e)}")
