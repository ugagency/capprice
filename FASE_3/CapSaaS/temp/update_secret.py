from werkzeug.security import generate_password_hash
import psycopg2

new_secret = "CapPrice@2026!A1"
new_hash = generate_password_hash(new_secret)

try:
    conn = psycopg2.connect(
        user='capssys_app', 
        password='SsySSaaS-CAP2025proX', 
        host='localhost', 
        port=5432, 
        dbname='capssys_bd',
        client_encoding='utf8'
    )
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE cs_app.tb_sso_client_redirect 
            SET redirect_url = 'http://localhost:5023/sso/callback'
            WHERE client_id = 'capprice'
        """)
        conn.commit()
        print("Updated 'capprice' redirect URL to localhost:5023")
    conn.close()
except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Error: {e}")
