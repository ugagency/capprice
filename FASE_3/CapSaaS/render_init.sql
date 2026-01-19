-- ============================================================================
-- RENDER INITIALIZATION SCRIPT - CapSaaS Ecosystem (PORTAL + PRICE + TRANSPORT)
-- Mirror of local environment "tudo igual"
-- ============================================================================

-- 1) Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Schemas
CREATE SCHEMA IF NOT EXISTS cs_app; -- SaaS Portal
CREATE SCHEMA IF NOT EXISTS ct_app; -- Cap Transportation

-- 3) Base SaaS Tables (cs_app)
SET search_path TO cs_app, public;

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
CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_user_email ON tb_user (lower(email));

CREATE TABLE IF NOT EXISTS tb_role (
  role_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           varchar(60) NOT NULL,
  descricao      varchar(150) NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_role_code ON tb_role (upper(code));

CREATE TABLE IF NOT EXISTS tb_permission (
  perm_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           varchar(120) NOT NULL,
  descricao      varchar(200) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_permission_code ON tb_permission (upper(code));

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

CREATE TABLE IF NOT EXISTS tb_module (
  module_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar(50) NOT NULL,
  nome        varchar(120) NOT NULL,
  descricao   varchar(255) NULL,
  route_path  varchar(120) NOT NULL,
  icon_key    varchar(50)  NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cs_app_module_code ON tb_module (upper(code));

CREATE TABLE IF NOT EXISTS tb_role_module (
  role_id    uuid NOT NULL,
  module_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, module_id),
  CONSTRAINT fk_rm_role   FOREIGN KEY (role_id) REFERENCES tb_role(role_id) ON DELETE CASCADE,
  CONSTRAINT fk_rm_module FOREIGN KEY (module_id) REFERENCES tb_module(module_id) ON DELETE CASCADE
);

-- SSO Tables
CREATE TABLE IF NOT EXISTS tb_sso_config (
  config_id            bigserial PRIMARY KEY,
  issuer               text NOT NULL,
  jwt_alg              text NOT NULL DEFAULT 'HS256',
  jwt_secret           text NULL,
  jwt_ttl_seconds      integer NOT NULL DEFAULT 900,
  code_ttl_seconds     integer NOT NULL DEFAULT 60,
  state_ttl_seconds    integer NOT NULL DEFAULT 300,
  enabled              boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tb_sso_client (
  client_id            text PRIMARY KEY,
  client_name          text NOT NULL,
  client_secret_hash   text NOT NULL,
  audience             text NOT NULL,
  enabled              boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tb_sso_client_redirect (
  redirect_id          bigserial PRIMARY KEY,
  client_id            text NOT NULL REFERENCES tb_sso_client(client_id) ON DELETE CASCADE,
  redirect_url         text NOT NULL,
  enabled              boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tb_sso_code (
  code           text PRIMARY KEY,
  state          text NOT NULL,
  client_id      text NOT NULL REFERENCES tb_sso_client(client_id),
  user_id        uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz NULL,
  request_ip     text NULL,
  user_agent     text NULL
);

-- App Specific Modules Permissions
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
  user_id    uuid NOT NULL,
  client_id  text NOT NULL,
  module_key text NOT NULL,
  allowed    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id, module_key),
  CONSTRAINT fk_uamp_user FOREIGN KEY (user_id) REFERENCES tb_user(user_id) ON DELETE CASCADE
);

-- 4) CapTransportation Tables (ct_app)
SET search_path TO ct_app, public;

CREATE TABLE IF NOT EXISTS tb_users (
  id              BIGSERIAL PRIMARY KEY,
  external_id     VARCHAR(120) UNIQUE,
  email           VARCHAR(255) NOT NULL UNIQUE,
  name            VARCHAR(255),
  is_master       BOOLEAN NOT NULL DEFAULT FALSE,
  perm_mestre       BOOLEAN NOT NULL DEFAULT FALSE,
  perm_comercial    BOOLEAN NOT NULL DEFAULT FALSE,
  perm_programacao  BOOLEAN NOT NULL DEFAULT FALSE,
  perm_industrial   BOOLEAN NOT NULL DEFAULT FALSE,
  perm_laboratorio  BOOLEAN NOT NULL DEFAULT FALSE,
  perm_faturamento  BOOLEAN NOT NULL DEFAULT FALSE,
  perm_permissions  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tb_pedidos (
  id BIGSERIAL PRIMARY KEY,
  chave VARCHAR(30) UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'comercial'
    CHECK (status IN ('comercial','programacao','industrial','laboratorio','faturamento','finalizado')),
  data DATE,
  ov_remessa VARCHAR(60),
  cif_fob VARCHAR(10),
  cliente VARCHAR(255),
  produto VARCHAR(255),
  local_entrega VARCHAR(255),
  uf_entrega CHAR(2),
  qtde_solicitada NUMERIC(12,3),
  assessor VARCHAR(255),
  assistente VARCHAR(255),
  refinaria VARCHAR(255),
  agendamento_refinaria VARCHAR(60),
  hora_agendamento VARCHAR(10),
  transportador VARCHAR(255),
  placa_cavalo VARCHAR(10),
  placa_carreta VARCHAR(10),
  motorista VARCHAR(255),
  solicitacao_remessa VARCHAR(80),
  nova_data_ov_venda DATE,
  pedido_remessa VARCHAR(80),
  hora_chegada VARCHAR(10),
  hora_entrada VARCHAR(10),
  hora_saida VARCHAR(10),
  confirmacao_pedido_remessa VARCHAR(20),
  lacres VARCHAR(255),
  lote VARCHAR(80),
  deposito VARCHAR(80),
  qtde_carregada NUMERIC(12,3),
  ca VARCHAR(80),
  data_liberacao DATE,
  obs_laboratorio TEXT,
  faturista VARCHAR(255),
  problema_faturar VARCHAR(80),
  numero_nf VARCHAR(80),
  data_faturamento DATE,
  valor_faturado NUMERIC(14,2),
  chave_nfe VARCHAR(120),
  obs_faturamento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) FINAL SEED (Exact mirror of local environment)
SET search_path TO cs_app, public;

-- Roles
INSERT INTO tb_role (code, descricao) VALUES
  ('ADMIN', 'Administrador do sistema'),
  ('USER',  'Usuário padrão')
ON CONFLICT DO NOTHING;

-- Admin User (Password: Admin#123)
INSERT INTO tb_user (email, nome, password_hash, must_change_pass, is_active)
VALUES (
  'admin@capssys.local',
  'Administrador',
  public.crypt('Admin#123', public.gen_salt('bf', 10)),
  true,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO tb_user_role (user_id, role_id)
SELECT u.user_id, r.role_id
FROM tb_user u JOIN tb_role r ON r.code = 'ADMIN'
WHERE u.email = 'admin@capssys.local' ON CONFLICT DO NOTHING;

-- Modules
INSERT INTO tb_module (code, nome, descricao, route_path, icon_key, is_active)
VALUES
  ('OPERACIONAL', 'Gestão Operacional', 'Controle de estoque, vendas, faturamento e fluxo de caixa.', '/operacional', 'home', true),
  ('BI',          'Inteligência de Negócio', 'Dashboards analíticos, KPIs e relatórios estratégicos.', '/bi', 'chart', true),
  ('ADMIN',       'Administração', 'Usuários, níveis, permissões e redefinição de senha.', '/admin', 'settings', true)
ON CONFLICT DO NOTHING;

INSERT INTO tb_role_module (role_id, module_id)
SELECT r.role_id, m.module_id FROM tb_role r CROSS JOIN tb_module m WHERE r.code = 'ADMIN' ON CONFLICT DO NOTHING;

-- SSO Config
INSERT INTO tb_sso_config (issuer, jwt_alg, jwt_secret, jwt_ttl_seconds, code_ttl_seconds, state_ttl_seconds, enabled)
VALUES ('capssys.local', 'HS256', '1MK4774Frmmd0nyw44CNNwWMwggEOdTDvEnFGVTX', 900, 60, 300, true)
ON CONFLICT DO NOTHING;

-- SSO Clients (WITH RECENT FIXES)
INSERT INTO tb_sso_client (client_id, client_name, client_secret_hash, audience, enabled)
VALUES 
  ('capprice', 'CAP PRICE', 
   'scrypt:32768:8:1$EWYDNJnyO025yWAF$2db619c2b6dcc833897e0052fa68790f16b955ed0459b99e135417b2132d1dff9f049d0ebacbbaa216309ffd0fbc93b99dfe16e68d66838bc91236c2a91317fe', 
   'capprice', true),
  ('captransportation', 'CAP TRANSPORTATION', 
   'scrypt:32768:8:1$gMZuj1EaidGqjaHZ$36c064c702a1761f077c34b7ffada0c6e8e3016bd274e6198adadef2dbfdb6d1f85b1c37fc7776c3d5a57d42a2d21370f2d0d7316c803eb9b9bae3ee0c2cfc69', 
   'captransportation', true)
ON CONFLICT (client_id) DO UPDATE SET client_secret_hash = EXCLUDED.client_secret_hash;

-- Redirects
INSERT INTO tb_sso_client_redirect (client_id, redirect_url, enabled) VALUES
  ('capprice', 'http://localhost:5023/sso/callback', true),
  ('captransportation', 'http://localhost:5024/sso/callback', true)
ON CONFLICT DO NOTHING;

-- App Modules (CapTransportation)
INSERT INTO tb_app_module (client_id, module_key, module_label, enabled)
VALUES
  ('captransportation','comercial','Comercial', true),
  ('captransportation','programacao','Programação', true),
  ('captransportation','industrial','Industrial', true),
  ('captransportation','laboratorio','Laboratório', true),
  ('captransportation','faturamento','Faturamento', true),
  ('captransportation','mestre','Mestre', true),
  ('captransportation','master','Admin', true)
ON CONFLICT DO NOTHING;

-- Admin Permissions for Modules
INSERT INTO tb_user_app_module_perm (user_id, client_id, module_key, allowed)
SELECT u.user_id, 'captransportation', m.module_key, true
FROM tb_user u CROSS JOIN tb_app_module m
WHERE u.email = 'admin@capssys.local' AND m.client_id = 'captransportation'
ON CONFLICT DO NOTHING;

-- Transportation Seed
SET search_path TO ct_app, public;
INSERT INTO tb_users (email, name, external_id, is_master, perm_mestre, perm_comercial, perm_programacao, perm_industrial, perm_laboratorio, perm_faturamento, perm_permissions)
VALUES ('admin@capssys.local', 'Admin', 'admin-seed', true, true, true, true, true, true, true, true)
ON CONFLICT (email) DO NOTHING;

-- 6) GRANTS
GRANT ALL ON SCHEMA cs_app TO public;
GRANT ALL ON SCHEMA ct_app TO public;
GRANT ALL ON ALL TABLES IN SCHEMA cs_app TO public;
GRANT ALL ON ALL TABLES IN SCHEMA ct_app TO public;
GRANT ALL ON ALL SEQUENCES IN SCHEMA cs_app TO public;
GRANT ALL ON ALL SEQUENCES IN SCHEMA ct_app TO public;
