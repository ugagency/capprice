-- 00_create_roles.sql
-- Execute como superuser (ex: postgres)

-- Role dona do banco/objetos
CREATE ROLE capssys_owner WITH
  LOGIN
  PASSWORD 'SsySSaaSCAP2025pluX'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

-- Role usada pela aplicação
CREATE ROLE capssys_app WITH
  LOGIN
  PASSWORD 'SsySSaaSCAP2025proX'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

-- 01_create_database.sql
-- Execute como superuser (ex: postgres), conectado no banco postgres

CREATE DATABASE capssys_bd
  WITH OWNER = capssys_owner
  ENCODING = 'UTF8'
  LC_COLLATE = 'pt_BR.UTF-8'
  LC_CTYPE = 'pt_BR.UTF-8'
  TEMPLATE = template0;

REVOKE ALL ON DATABASE capssys_bd FROM PUBLIC;
GRANT CONNECT ON DATABASE capssys_bd TO capssys_app;
GRANT ALL PRIVILEGES ON DATABASE capssys_bd TO capssys_owner;


-- 02_schema_cs_app.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS cs_app AUTHORIZATION capssys_owner;

REVOKE ALL ON SCHEMA cs_app FROM PUBLIC;
GRANT USAGE ON SCHEMA cs_app TO capssys_app;
GRANT ALL ON SCHEMA cs_app TO capssys_owner;

ALTER DEFAULT PRIVILEGES FOR ROLE capssys_owner IN SCHEMA cs_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO capssys_app;

ALTER DEFAULT PRIVILEGES FOR ROLE capssys_owner IN SCHEMA cs_app
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO capssys_app;


-- 03_auth_core_tables.sql
SET search_path TO cs_app;

CREATE TABLE IF NOT EXISTS tb_user (
  user_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              varchar(255) NOT NULL,
  nome               varchar(150) NOT NULL,
  password_hash      text NOT NULL,
  must_change_pass   boolean NOT NULL DEFAULT false,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NULL,
  last_login_at      timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_user_email
  ON tb_user (lower(email));

ALTER TABLE tb_user
  DROP CONSTRAINT IF EXISTS fk_tb_user_created_by,
  ADD CONSTRAINT fk_tb_user_created_by
    FOREIGN KEY (created_by) REFERENCES tb_user(user_id) ON DELETE SET NULL;

ALTER TABLE tb_user
  DROP CONSTRAINT IF EXISTS fk_tb_user_updated_by,
  ADD CONSTRAINT fk_tb_user_updated_by
    FOREIGN KEY (updated_by) REFERENCES tb_user(user_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS tb_role (
  role_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           varchar(60) NOT NULL,
  descricao      varchar(150) NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_role_code
  ON tb_role (upper(code));

CREATE TABLE IF NOT EXISTS tb_permission (
  perm_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           varchar(120) NOT NULL,
  descricao      varchar(200) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_permission_code
  ON tb_permission (upper(code));

CREATE TABLE IF NOT EXISTS tb_role_permission (
  role_id      uuid NOT NULL,
  perm_id      uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, perm_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES tb_role(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (perm_id) REFERENCES tb_permission(perm_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tb_user_role (
  user_id     uuid NOT NULL,
  role_id     uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES tb_user(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES tb_role(role_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_tb_user_role_role_id ON tb_user_role(role_id);

CREATE TABLE IF NOT EXISTS tb_login_audit (
  audit_id      bigserial PRIMARY KEY,
  user_id       uuid NULL,
  email         varchar(255) NULL,
  success       boolean NOT NULL,
  ip            inet NULL,
  user_agent    text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  fail_reason   varchar(200) NULL,
  CONSTRAINT fk_login_audit_user FOREIGN KEY (user_id) REFERENCES tb_user(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_tb_login_audit_user_id ON tb_login_audit(user_id);
CREATE INDEX IF NOT EXISTS ix_tb_login_audit_created_at ON tb_login_audit(created_at);

CREATE TABLE IF NOT EXISTS tb_password_token (
  token_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  token_hash      text NOT NULL,
  purpose         varchar(30) NOT NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_ip      inet NULL,
  CONSTRAINT fk_pwd_token_user FOREIGN KEY (user_id) REFERENCES tb_user(user_id) ON DELETE CASCADE,
  CONSTRAINT ck_pwd_token_purpose CHECK (purpose IN ('RESET','FIRST_ACCESS'))
);

CREATE INDEX IF NOT EXISTS ix_tb_password_token_user_id ON tb_password_token(user_id);
CREATE INDEX IF NOT EXISTS ix_tb_password_token_expires ON tb_password_token(expires_at);

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_tb_user_set_updated_at ON tb_user;
CREATE TRIGGER tg_tb_user_set_updated_at
BEFORE UPDATE ON tb_user
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

-- 04_seed_minimo_compat.sql

SET search_path TO cs_app, public;

INSERT INTO tb_role (code, descricao)
VALUES
  ('ADMIN', 'Administrador do sistema'),
  ('USER',  'Usuário padrão')
ON CONFLICT (upper(code)) DO NOTHING;

INSERT INTO tb_permission (code, descricao)
VALUES
  ('AUTH:USER:READ',  'Listar usuários'),
  ('AUTH:USER:WRITE', 'Criar/editar usuários'),
  ('AUTH:ROLE:READ',  'Listar níveis/papéis'),
  ('AUTH:ROLE:WRITE', 'Criar/editar níveis/papéis')
ON CONFLICT (upper(code)) DO NOTHING;

INSERT INTO tb_role_permission (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM tb_role r
JOIN tb_permission p
  ON p.code IN ('AUTH:USER:READ','AUTH:USER:WRITE','AUTH:ROLE:READ','AUTH:ROLE:WRITE')
WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;

WITH u AS (
  INSERT INTO tb_user (email, nome, password_hash, must_change_pass, is_active)
  VALUES (
    'admin@capssys.local',
    'Administrador',
    public.crypt('Admin#123', public.gen_salt('bf', 10)),
    true,
    true
  )
  ON CONFLICT (lower(email)) DO NOTHING
  RETURNING user_id
)
INSERT INTO tb_user_role (user_id, role_id)
SELECT u.user_id, r.role_id
FROM u
JOIN tb_role r ON r.code = 'ADMIN'
ON CONFLICT DO NOTHING;

--- Permissão 

-- Rode conectado em capssys_bd, como owner/superuser

-- Garantir acesso ao schema
GRANT USAGE ON SCHEMA cs_app TO capssys_app;

-- Garantir acesso às tabelas já existentes
GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA cs_app
TO capssys_app;

-- Garantir acesso às sequências (ex: tb_login_audit.audit_id)
GRANT USAGE, SELECT, UPDATE
ON ALL SEQUENCES IN SCHEMA cs_app
TO capssys_app;

-- Garantir que as PRÓXIMAS tabelas/sequências criadas no schema também já venham com grants
ALTER DEFAULT PRIVILEGES FOR ROLE capssys_owner IN SCHEMA cs_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO capssys_app;

ALTER DEFAULT PRIVILEGES FOR ROLE capssys_owner IN SCHEMA cs_app
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO capssys_app;


-- Qual usuário está conectado na sessão do pgAdmin
SELECT current_user;

-- O app user consegue ler a tabela?
SET ROLE capssys_app;
SELECT 1 FROM cs_app.tb_user LIMIT 1;
RESET ROLE;


------------- 
-- Módulos disponíveis na tela de plataformas
CREATE TABLE IF NOT EXISTS cs_app.tb_module (
  module_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar(50) NOT NULL,        -- ex: OPERACIONAL, BI, ADMIN
  nome        varchar(120) NOT NULL,
  descricao   varchar(255) NULL,
  route_path  varchar(120) NOT NULL,       -- ex: /operacional, /bi, /admin
  icon_key    varchar(50)  NULL,           -- opcional (front pode mapear)
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cs_app_module_code
  ON cs_app.tb_module (upper(code));

-- Vínculo: nível (role) -> módulos
CREATE TABLE IF NOT EXISTS cs_app.tb_role_module (
  role_id    uuid NOT NULL,
  module_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, module_id),
  CONSTRAINT fk_rm_role   FOREIGN KEY (role_id) REFERENCES cs_app.tb_role(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_rm_module FOREIGN KEY (module_id) REFERENCES cs_app.tb_module(module_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_rm_role_id ON cs_app.tb_role_module(role_id);
CREATE INDEX IF NOT EXISTS ix_rm_module_id ON cs_app.tb_role_module(module_id);

----

INSERT INTO cs_app.tb_module (code, nome, descricao, route_path, icon_key, is_active)
VALUES
  ('OPERACIONAL', 'Gestão Operacional', 'Controle de estoque, vendas, faturamento e fluxo de caixa.', '/operacional', 'home', true),
  ('BI',          'Inteligência de Negócio', 'Dashboards analíticos, KPIs e relatórios estratégicos.', '/bi', 'chart', true),
  ('ADMIN',       'Administração', 'Usuários, níveis, permissões e redefinição de senha.', '/admin', 'settings', true)
ON CONFLICT (upper(code)) DO NOTHING;

---

-- ADMIN tem acesso a todos os módulos
INSERT INTO cs_app.tb_role_module (role_id, module_id)
SELECT r.role_id, m.module_id
FROM cs_app.tb_role r
CROSS JOIN cs_app.tb_module m
WHERE upper(r.code) = 'ADMIN'
ON CONFLICT DO NOTHING;


--- 
--1.4 Vincular OPERACIONAL + BI ao nível USER (opcional)
INSERT INTO cs_app.tb_role_module (role_id, module_id)
SELECT r.role_id, m.module_id
FROM cs_app.tb_role r
JOIN cs_app.tb_module m ON upper(m.code) IN ('OPERACIONAL','BI')
WHERE upper(r.code) = 'USER'
ON CONFLICT DO NOTHING;

----

GRANT USAGE ON SCHEMA cs_app TO capssys_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cs_app TO capssys_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA cs_app TO capssys_app;

ALTER DEFAULT PRIVILEGES FOR ROLE capssys_owner IN SCHEMA cs_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO capssys_app;

ALTER DEFAULT PRIVILEGES FOR ROLE capssys_owner IN SCHEMA cs_app
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO capssys_app;

------- SSO 

CREATE SCHEMA IF NOT EXISTS cs_app;

CREATE TABLE IF NOT EXISTS cs_app.tb_sso_config (
  config_id            bigserial PRIMARY KEY,
  issuer               text NOT NULL,              -- ex: "capssys.local" / "capssys.seudominio.com"
  jwt_alg              text NOT NULL DEFAULT 'HS256',  -- HS256 (início) ou RS256 (evolução)
  jwt_secret           text NULL,                  -- HS256: segredo de assinatura (preferir criptografar)
  jwt_ttl_seconds      integer NOT NULL DEFAULT 900,
  code_ttl_seconds     integer NOT NULL DEFAULT 60,
  state_ttl_seconds    integer NOT NULL DEFAULT 300,
  enabled              boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Garante que exista apenas 1 config ativa (opcional: por ambiente)
CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_sso_config_enabled
  ON cs_app.tb_sso_config (enabled)
  WHERE enabled = true;


CREATE TABLE IF NOT EXISTS cs_app.tb_sso_client (
  client_id            text PRIMARY KEY,       -- ex: "capprice"
  client_name          text NOT NULL,
  client_secret_hash   text NOT NULL,          -- hash do secret (não salvar secret em texto puro)
  audience             text NOT NULL,           -- ex: "capprice"
  enabled              boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS cs_app.tb_sso_client_redirect (
  redirect_id          bigserial PRIMARY KEY,
  client_id            text NOT NULL REFERENCES cs_app.tb_sso_client(client_id) ON DELETE CASCADE,
  redirect_url         text NOT NULL,
  enabled              boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_sso_client_redirect
  ON cs_app.tb_sso_client_redirect (client_id, redirect_url);


CREATE TABLE IF NOT EXISTS cs_app.tb_sso_code (
  code           text PRIMARY KEY,
  state          text NOT NULL,
  client_id      text NOT NULL REFERENCES cs_app.tb_sso_client(client_id),
  user_id        uuid NOT NULL,                       -- ajuste para o tipo real do seu user_id
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz NULL,
  request_ip     text NULL,
  user_agent     text NULL
);

CREATE INDEX IF NOT EXISTS ix_tb_sso_code_lookup
  ON cs_app.tb_sso_code (client_id, expires_at, used_at);


INSERT INTO cs_app.tb_sso_config (issuer, jwt_alg, jwt_secret, jwt_ttl_seconds, code_ttl_seconds, state_ttl_seconds, enabled)
VALUES (
  'capssys.local',
  'HS256',
  '1MK4774Frmmd0nyw44CNNwWMwggEOdTDvEnFGVTX',
  900,
  60,
  300,
  true
)
ON CONFLICT DO NOTHING;


INSERT INTO cs_app.tb_sso_client (client_id, client_name, client_secret_hash, audience, enabled)
VALUES (
  'capprice',
  'CAP PRICE',
  'scrypt:32768:8:1$BTCXBd461aY3VP9d$f631ffa0d991771de9f58fdb047afe147d08'
  || '130a22fb255406d3205486eba06e7339d6438e33f95f1ee410955d54d2b1cc886a8b40'
  || 'f3b6ef3949569c3ddaa001',
  'capprice',
  true
)
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO cs_app.tb_sso_client_redirect (client_id, redirect_url, enabled)
VALUES
  ('capprice', 'http://capprice.local:5025/sso/callback', true)
ON CONFLICT DO NOTHING;

----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cs_app.tb_app_module (
  id            bigserial PRIMARY KEY,
  client_id     text NOT NULL,               -- ex: 'captransportation'
  module_key    text NOT NULL,               -- ex: 'comercial'
  module_label  text NOT NULL,               -- ex: 'Comercial'
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, module_key)
);

CREATE TABLE IF NOT EXISTS cs_app.tb_user_app_module_perm (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL,                -- FK para sua tabela de usuários no CAPSSYS (ajuste o schema/tabela)
  client_id  text NOT NULL,                  -- ex: 'captransportation'
  module_key text NOT NULL,                  -- ex: 'comercial'
  allowed    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_uamp_user_client
  ON cs_app.tb_user_app_module_perm (user_id, client_id);


INSERT INTO cs_app.tb_app_module (client_id, module_key, module_label, enabled)
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
