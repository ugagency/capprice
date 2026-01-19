
import psycopg2
import os

# Adicione o ?sslmode=require no final!
DB_URL = "postgresql://capssys_app:5rfH1lqzZpOIAHYzDhQkshnzjpwIiT56@dpg-d5nanml6ubrc73aodet0-a.oregon-postgres.render.com/capssys_bd?sslmode=require"

def deploy():
    try:
        print("🚀 Conectando ao banco do Render (com SSL)...")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        # Procura o arquivo na FASE_3 ou no diretório atual
        possible_paths = [
            os.path.join(os.getcwd(), 'FASE_3', 'render_init.sql'),
            os.path.join(os.getcwd(), 'render_init.sql')
        ]
        
        sql_path = next((p for p in possible_paths if os.path.exists(p)), None)
        
        if not sql_path:
            print("❌ ERRO: Arquivo render_init.sql não encontrado!")
            return

        print(f"📄 Lendo script: {sql_path}")
        with open(sql_path, 'r', encoding='utf-8') as f:
            sql_script = f.read()
            
        print("⚙️ Executando comandos SQL... (isso pode levar alguns segundos)")
        cur.execute(sql_script)
        
        conn.commit()
        print("✅ Banco de dados inicializado com SUCESSO!")
        
    except Exception as e:
        print(f"❌ ERRO ao rodar o script: {e}")
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    deploy()