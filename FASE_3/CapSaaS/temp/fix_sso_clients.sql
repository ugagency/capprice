-- fix_sso_clients.sql

SET search_path TO cs_app;

-- 1. Insert CapTransportation Client
INSERT INTO tb_sso_client (client_id, client_name, client_secret_hash, audience, enabled)
VALUES (
  'captransportation',
  'Cap Transportation',
  'scrypt:32768:8:1$gMZuj1EaidGqjaHZ$36c064c702a1761f077c34b7ffada0c6e8e3016bd274e6198adadef2dbfdb6d1f85b1c37fc7776c3d5a57d42a2d21370f2d0d7316c803eb9b9bae3ee0c2cfc69',
  'captransportation',
  true
)
ON CONFLICT (client_id) DO NOTHING;

-- 2. Insert Redirect for CapTransportation
INSERT INTO tb_sso_client_redirect (client_id, redirect_url, enabled)
VALUES (
  'captransportation',
  'http://localhost:5024/sso/callback',
  true
)
ON CONFLICT (client_id, redirect_url) DO NOTHING;

-- 3. Fix CapPrice Redirect (Change from capprice.local:5025 to localhost:5023)
-- First, disable or delete the old one to avoid confusion, or just add the new one?
-- Better to update if it exists or insert new.
-- Let's delete the old one just in case it causes issues if the app tries to use it.
DELETE FROM tb_sso_client_redirect 
WHERE client_id = 'capprice' AND redirect_url LIKE '%capprice.local%';

INSERT INTO tb_sso_client_redirect (client_id, redirect_url, enabled)
VALUES (
  'capprice',
  'http://localhost:5023/sso/callback',
  true
)
ON CONFLICT (client_id, redirect_url) DO NOTHING;
