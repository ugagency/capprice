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
    print('Connected!')
    conn.close()
except Exception as e:
    print(f'Error type: {type(e)}')
    print(f'Error string: {str(e)}')
    try:
        # Try to get raw error message if possible
        if hasattr(e, 'cursor') and e.cursor:
            print(f'Cursor message: {e.cursor.statusmessage}')
    except:
        pass
    
    # If it's a UnicodeDecodeError, it might be in the system locale
    import traceback
    traceback.print_exc()
