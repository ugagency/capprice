# app/models/pedido.py
from __future__ import annotations

from datetime import datetime
from app import db


class Pedido(db.Model):
    __tablename__ = "tb_pedidos"
    __table_args__ = {"schema": "ct_app"}

    id = db.Column(db.Integer, primary_key=True)

    chave = db.Column(db.String(32), nullable=True, unique=True)
    status = db.Column(db.String(32), nullable=False, default="comercial")

    data = db.Column(db.Date, nullable=True)
    ov_remessa = db.Column(db.String(120), nullable=True)
    cif_fob = db.Column(db.String(10), nullable=True)
    cliente = db.Column(db.String(255), nullable=True)
    produto = db.Column(db.String(255), nullable=True)
    local_entrega = db.Column(db.String(255), nullable=True)
    uf_entrega = db.Column(db.String(2), nullable=True)
    qtde_solicitada = db.Column(db.Numeric(12, 3), nullable=True)

    assessor = db.Column(db.String(255), nullable=True)
    assistente = db.Column(db.String(255), nullable=True)

    refinaria = db.Column(db.String(255), nullable=True)
    agendamento_refinaria = db.Column(db.String(50), nullable=True)
    hora_agendamento = db.Column(db.String(10), nullable=True)
    transportador = db.Column(db.String(255), nullable=True)
    placa_cavalo = db.Column(db.String(20), nullable=True)
    placa_carreta = db.Column(db.String(20), nullable=True)
    motorista = db.Column(db.String(255), nullable=True)
    solicitacao_remessa = db.Column(db.String(120), nullable=True)
    nova_data_ov_venda = db.Column(db.Date, nullable=True)
    pedido_remessa = db.Column(db.String(120), nullable=True)

    hora_chegada = db.Column(db.String(10), nullable=True)
    hora_entrada = db.Column(db.String(10), nullable=True)
    hora_saida = db.Column(db.String(10), nullable=True)

    confirmacao_pedido_remessa = db.Column(db.String(10), nullable=True)
    lacres = db.Column(db.String(255), nullable=True)
    lote = db.Column(db.String(255), nullable=True)
    deposito = db.Column(db.String(255), nullable=True)
    qtde_carregada = db.Column(db.Numeric(12, 3), nullable=True)
    ca = db.Column(db.String(255), nullable=True)
    data_liberacao = db.Column(db.Date, nullable=True)
    obs_laboratorio = db.Column(db.Text, nullable=True)

    faturista = db.Column(db.String(255), nullable=True)
    problema_faturar = db.Column(db.String(255), nullable=True)
    numero_nf = db.Column(db.String(255), nullable=True)
    data_faturamento = db.Column(db.Date, nullable=True)
    valor_faturado = db.Column(db.Numeric(14, 2), nullable=True)
    chave_nfe = db.Column(db.String(255), nullable=True)
    obs_faturamento = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        def d(v):
            return v.isoformat() if hasattr(v, "isoformat") and v else (str(v) if v is not None else None)

        return {
            "id": self.id,
            "chave": self.chave,
            "status": self.status,
            "data": d(self.data),
            "ov_remessa": self.ov_remessa,
            "cif_fob": self.cif_fob,
            "cliente": self.cliente,
            "produto": self.produto,
            "local_entrega": self.local_entrega,
            "uf_entrega": self.uf_entrega,
            "qtde_solicitada": d(self.qtde_solicitada),
            "assessor": self.assessor,
            "assistente": self.assistente,

            "refinaria": self.refinaria,
            "agendamento_refinaria": self.agendamento_refinaria,
            "hora_agendamento": self.hora_agendamento,
            "transportador": self.transportador,
            "placa_cavalo": self.placa_cavalo,
            "placa_carreta": self.placa_carreta,
            "motorista": self.motorista,
            "solicitacao_remessa": self.solicitacao_remessa,
            "nova_data_ov_venda": d(self.nova_data_ov_venda),
            "pedido_remessa": self.pedido_remessa,

            "hora_chegada": self.hora_chegada,
            "hora_entrada": self.hora_entrada,
            "hora_saida": self.hora_saida,

            "confirmacao_pedido_remessa": self.confirmacao_pedido_remessa,
            "lacres": self.lacres,
            "lote": self.lote,
            "deposito": self.deposito,
            "qtde_carregada": d(self.qtde_carregada),
            "ca": self.ca,
            "data_liberacao": d(self.data_liberacao),
            "obs_laboratorio": self.obs_laboratorio,

            "faturista": self.faturista,
            "problema_faturar": self.problema_faturar,
            "numero_nf": self.numero_nf,
            "data_faturamento": d(self.data_faturamento),
            "valor_faturado": d(self.valor_faturado),
            "chave_nfe": self.chave_nfe,
            "obs_faturamento": self.obs_faturamento,
        }
