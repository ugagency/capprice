import psycopg2
import os
import sys

def init_db():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL não encontrada.")
        sys.exit(0) # Não para o container, mas não faz nada

    try:
        print("🚀 Verificando integridade do banco de dados...")
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()

        # Verifica se o esquema fundamental existe
        cur.execute("SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname = 'cs_app';")
        exists = cur.fetchone()

        if exists:
            print("✅ Banco de dados já parece estar inicializado (cs_app detectado).")
            return

        print("⚠️  Banco vazio. Iniciando a carga do script SQL...")
        
        sql_path = os.path.join(os.path.dirname(__file__), 'render_init.sql')
        if not os.path.exists(sql_path):
            print(f"❌ Arquivo {sql_path} não encontrado.")
            return

        with open(sql_path, 'r', encoding='utf-8') as f:
            sql_script = f.read()

        cur.execute(sql_script)
        print("✅ Inicialização concluída com sucesso!")

    except Exception as e:
        print(f"❌ Erro na auto-inicialização: {e}")
        # Not exiting with error to prevent crash loop, but logs will show the issue
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    init_db()
