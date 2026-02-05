import psycopg2
import os
import sys

def update_redirects():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found, skipping redirects update.")
        return

    # Mapeamento de client_id -> ENV_VAR
    redirects_to_update = {
        "capprice": os.getenv("REDIRECT_URL_CAPPRICE"),
        "captransportation": os.getenv("REDIRECT_URL_CAPTRANSPORTATION")
    }

    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()

        for client_id, url in redirects_to_update.items():
            if not url:
                print(f"Skipping {client_id}: ENV VAR not set.")
                continue

            print(f"Updating redirect for {client_id} to: {url}")
            
            # Remove redirecionamentos antigos do tipo 'localhost' ou duplicados para este client
            # (Mantendo a tabela limpa com apenas a URL de produção)
            cur.execute("""
                DELETE FROM cs_app.tb_sso_client_redirect 
                WHERE client_id = %s;
            """, (client_id,))

            # Insere a nova URL de produção
            cur.execute("""
                INSERT INTO cs_app.tb_sso_client_redirect (client_id, redirect_url, enabled) 
                VALUES (%s, %s, true);
            """, (client_id, url))
        
        print("✅ SSO Redirects updated successfully.")

    except Exception as e:
        print(f"❌ Error updating redirects: {e}")
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    update_redirects()
