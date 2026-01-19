-- ============================================================================
-- CAP Transportation - Schema + Tables
-- Schema: ct_app
-- Database: capssys_bd
-- ============================================================================

BEGIN;

-- 1) Schema
CREATE SCHEMA IF NOT EXISTS ct_app;

-- 2) Usuários e permissões por módulo/tela
CREATE TABLE IF NOT EXISTS ct_app.tb_users (
  id              BIGSERIAL PRIMARY KEY,

  -- IDs do SSO (opcional, recomendado)
  external_id     VARCHAR(120) UNIQUE,
  email           VARCHAR(255) NOT NULL UNIQUE,
  name            VARCHAR(255),

  -- Admin geral
  is_master       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Permissões por módulo/tela
  perm_mestre       BOOLEAN NOT NULL DEFAULT FALSE,
  perm_comercial    BOOLEAN NOT NULL DEFAULT FALSE,
  perm_programacao  BOOLEAN NOT NULL DEFAULT FALSE,
  perm_industrial   BOOLEAN NOT NULL DEFAULT FALSE,
  perm_laboratorio  BOOLEAN NOT NULL DEFAULT FALSE,
  perm_faturamento  BOOLEAN NOT NULL DEFAULT FALSE,
  perm_permissions  BOOLEAN NOT NULL DEFAULT FALSE, -- tela de permissões (admin)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tb_users_email ON ct_app.tb_users (email);
CREATE INDEX IF NOT EXISTS ix_tb_users_external_id ON ct_app.tb_users (external_id);

-- 3) Pedidos (alinhado com os campos que suas telas usam)
CREATE TABLE IF NOT EXISTS ct_app.tb_pedidos (
  id BIGSERIAL PRIMARY KEY,

  -- Identificador amigável (ex: PED-0001) - pode ser gerado no app
  chave VARCHAR(30) UNIQUE,

  -- Status do fluxo
  status VARCHAR(30) NOT NULL DEFAULT 'comercial'
    CHECK (status IN ('comercial','programacao','industrial','laboratorio','faturamento','finalizado')),

  -- =========================
  -- COMERCIAL
  -- =========================
  data               DATE,
  ov_remessa         VARCHAR(60),
  cif_fob            VARCHAR(10),
  cliente            VARCHAR(255),
  produto            VARCHAR(255),
  local_entrega      VARCHAR(255),
  uf_entrega         CHAR(2),
  qtde_solicitada    NUMERIC(12,3),
  assessor           VARCHAR(255),
  assistente         VARCHAR(255),

  -- =========================
  -- PROGRAMAÇÃO
  -- =========================
  refinaria              VARCHAR(255),
  agendamento_refinaria  VARCHAR(60),
  hora_agendamento       VARCHAR(10),
  transportador          VARCHAR(255),
  placa_cavalo           VARCHAR(10),
  placa_carreta          VARCHAR(10),
  motorista              VARCHAR(255),
  solicitacao_remessa    VARCHAR(80),
  nova_data_ov_venda      DATE,
  pedido_remessa         VARCHAR(80),

  -- =========================
  -- INDUSTRIAL
  -- =========================
  hora_chegada   VARCHAR(10),
  hora_entrada   VARCHAR(10),
  hora_saida     VARCHAR(10),

  -- =========================
  -- LABORATÓRIO
  -- =========================
  confirmacao_pedido_remessa VARCHAR(20),
  lacres        VARCHAR(255),
  lote          VARCHAR(80),
  deposito      VARCHAR(80),
  qtde_carregada NUMERIC(12,3),
  ca            VARCHAR(80),
  data_liberacao DATE,
  obs_laboratorio TEXT,

  -- =========================
  -- FATURAMENTO
  -- =========================
  faturista       VARCHAR(255),
  problema_faturar VARCHAR(80),
  numero_nf        VARCHAR(80),
  data_faturamento DATE,
  valor_faturado   NUMERIC(14,2),
  chave_nfe        VARCHAR(120),
  obs_faturamento  TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tb_pedidos_status ON ct_app.tb_pedidos (status);
CREATE INDEX IF NOT EXISTS ix_tb_pedidos_ov_remessa ON ct_app.tb_pedidos (ov_remessa);
CREATE INDEX IF NOT EXISTS ix_tb_pedidos_cliente ON ct_app.tb_pedidos (cliente);
CREATE INDEX IF NOT EXISTS ix_tb_pedidos_produto ON ct_app.tb_pedidos (produto);

COMMIT;


INSERT INTO ct_app.tb_users (
  email, name, external_id,
  is_master,
  perm_mestre, perm_comercial, perm_programacao, perm_industrial, perm_laboratorio, perm_faturamento,
  perm_permissions
)
VALUES (
  'admin@local', 'Admin', 'admin-seed',
  true,
  true, true, true, true, true, true,
  true
)
ON CONFLICT (email) DO NOTHING;


-- 1) Permitir acessar o schema
GRANT USAGE ON SCHEMA ct_app TO capssys_app;

-- 2) Permitir operar nas tabelas já existentes
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ct_app TO capssys_app;

-- 3) Permitir usar sequences (BIGSERIAL) para INSERT funcionar
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ct_app TO capssys_app;

-- 4) Garantir permissões para tabelas/sequences criadas no futuro
ALTER DEFAULT PRIVILEGES IN SCHEMA ct_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO capssys_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA ct_app
GRANT USAGE, SELECT ON SEQUENCES TO capssys_app;


INSERT INTO cs_app.tb_sso_client (
  client_id,
  client_name,
  client_secret_hash,
  audience,
  enabled
)
VALUES (
  'captransportation',
  'CAP TRANSPORTATION',
  'scrypt:32768:8:1$9kS2N8JqVZc0M4Xr$'
  || '5f6d3cbe1b6f6c9d8b17d94e3c2a4c7a8e5b9d6f6a2c3b9d8f1a6c4d5b7e'
  || 'e4c9a1b7f3d6a9c8b5e2f7d1a6c3b8e9f0a4d5c6b7a8e9',
  'captransportation',
  true
)
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO cs_app.tb_sso_client_redirect (
  client_id,
  redirect_url,
  enabled
) VALUES (
  'captransportation',
  'http://localhost:5024/sso/callback',
  true
);
