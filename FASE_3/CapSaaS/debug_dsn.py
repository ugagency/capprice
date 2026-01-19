import os
from dotenv import load_dotenv

load_dotenv()
dsn = os.getenv('DATABASE_URL')
print(f'DSN: {dsn}')
print(f'DSN Type: {type(dsn)}')
if dsn:
    print(f'DSN Encoded: {dsn.encode("utf-8", "replace")}')
    try:
        dsn.encode('ascii')
        print('DSN is pure ASCII')
    except UnicodeEncodeError as e:
        print(f'DSN contains non-ASCII: {e}')
