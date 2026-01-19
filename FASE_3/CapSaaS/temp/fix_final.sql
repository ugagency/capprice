-- fix_final.sql

SET search_path TO cs_app;

-- 1. Fix CapPrice Secret Hash
UPDATE tb_sso_client
SET client_secret_hash = 'scrypt:32768:8:1$EWYDNJnyO025yWAF$2db619c2b6dcc833897e0052fa68790f16b955ed0459b99e135417b2132d1dff9f049d0ebacbbaa216309ffd0fbc93b99dfe16e68d66838bc91236c2a91317fe'
WHERE client_id = 'capprice';

-- 2. Grant Permissions for Cap Transportation modules to Admin
-- Assuming 'admin@capssys.local' exists and we want to give them access to all modules of captransportation
DO $$
DECLARE
    v_user_id uuid;
BEGIN
    SELECT user_id INTO v_user_id FROM tb_user WHERE email = 'admin@capssys.local';
    
    IF v_user_id IS NOT NULL THEN
        -- Insert permissions for all modules of captransportation
        INSERT INTO cs_app.tb_user_app_module_perm (user_id, client_id, module_key, allowed)
        SELECT v_user_id, 'captransportation', module_key, true
        FROM cs_app.tb_app_module
        WHERE client_id = 'captransportation'
        ON CONFLICT (user_id, client_id, module_key) DO UPDATE SET allowed = true;
    END IF;
END $$;
