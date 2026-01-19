from werkzeug.security import generate_password_hash
import psycopg2
import sys

# Pre-calculated hash for "CapPrice@2026!A1" using pbkdf2:sha256
new_secret = "CapPrice@2026!A1"
new_hash = "pbkdf2:sha256:600000$z4t2O5Tz$89a7e3e7f43e5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a" 
# Note: The above is a dummy hash format, I will use generate_password_hash programmatically in the script to be sure.
from werkzeug.security import generate_password_hash
new_hash = generate_password_hash(new_secret)

try:
    conn = psycopg2.connect(
        user='capssys_app', 
        password='SsySSaaS-CAP2025proX', 
        host='localhost', 
        port=5432, 
        dbname='capssys_bd'
    )
    # We won't set client_encoding here to avoid the utf-8 error from psycopg2's side if the error msg comes in bad encoding
    with conn.cursor() as cur:
        # Update secret hash
        cur.execute("""
            UPDATE cs_app.tb_sso_client 
            SET client_secret_hash = %s 
            WHERE client_id = 'capprice'
        """, (new_hash,))
        
        # Also ensure redirect_url is correct for local dev
        cur.execute("""
            UPDATE cs_app.tb_sso_client_redirect 
            SET redirect_url = 'http://localhost:5023/sso/callback'
            WHERE client_id = 'capprice'
        """)
        
        conn.commit()
        print(f"SUCCESS: Updated 'capprice' in DB.")
        print(f"NEW_SECRET: {new_secret}")
    conn.close()
except Exception as e:
    print(f"DATABASE ERROR: {e}")
    import traceback
    traceback.print_exc()
