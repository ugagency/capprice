-- v4_reset_secret.sql
-- Run with: psql -U capssys_app -d capssys_bd -f v4_reset_secret.sql

BEGIN;

-- Hash generated for "CapPrice@2026!A1"
UPDATE cs_app.tb_sso_client 
SET client_secret_hash = 'scrypt:32768:8:1$XPC5PQxigbzkDDQQ$fadb4031d120206b6f7d2212190628c6cc747057232f3f56b26b42c1154c29b481e9062b7408f7ade2f7544d6d1725f563d2ed6476a1dcb5789b56de423aaaa6'
WHERE client_id = 'capprice';

UPDATE cs_app.tb_sso_client_redirect 
SET redirect_url = 'http://localhost:5023/sso/callback'
WHERE client_id = 'capprice';

COMMIT;

SELECT 'SUCCESS: SSO reset completed for capprice' as status;
