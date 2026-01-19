-- create_missing_tables.sql

SET search_path TO cs_app;

CREATE TABLE IF NOT EXISTS tb_app_module (
  id            bigserial PRIMARY KEY,
  client_id     text NOT NULL,
  module_key    text NOT NULL,
  module_label  text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, module_key)
);

CREATE TABLE IF NOT EXISTS tb_user_app_module_perm (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL,  -- Changed to uuid to match tb_user
  client_id  text NOT NULL,
  module_key text NOT NULL,
  allowed    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id, module_key),
  CONSTRAINT fk_uamp_user FOREIGN KEY (user_id) REFERENCES tb_user(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_uamp_user_client
  ON tb_user_app_module_perm (user_id, client_id);

-- Insert CapTransportation modules
INSERT INTO tb_app_module (client_id, module_key, module_label, enabled)
VALUES
  ('captransportation','comercial','Comercial', true),
  ('captransportation','programacao','Programação', true),
  ('captransportation','industrial','Industrial', true),
  ('captransportation','laboratorio','Laboratório', true),
  ('captransportation','faturamento','Faturamento', true),
  ('captransportation','mestre','Mestre', true),
  ('captransportation','master','Admin', true)
ON CONFLICT (client_id, module_key) DO UPDATE
SET module_label = EXCLUDED.module_label,
    enabled      = EXCLUDED.enabled;

-- Grant permissions to Admin user
DO $$
DECLARE
    v_user_id uuid;
BEGIN
    SELECT user_id INTO v_user_id FROM tb_user WHERE email = 'admin@capssys.local';
    
    IF v_user_id IS NOT NULL THEN
        INSERT INTO tb_user_app_module_perm (user_id, client_id, module_key, allowed)
        SELECT v_user_id, 'captransportation', module_key, true
        FROM tb_app_module
        WHERE client_id = 'captransportation'
        ON CONFLICT (user_id, client_id, module_key) DO UPDATE SET allowed = true;
    END IF;
END $$;
