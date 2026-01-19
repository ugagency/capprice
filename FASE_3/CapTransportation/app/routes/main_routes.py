# app/routes/main_routes.py
from flask import Blueprint, render_template, redirect, session, current_app, g, make_response
import io
from xhtml2pdf import pisa
from app.security.guards import login_required

main_bp = Blueprint("main", __name__)


def _perms() -> dict:
    u = getattr(g, "user", None)
    if isinstance(u, dict):
        p = u.get("permissions") or {}
        return p if isinstance(p, dict) else {}
    return {}


def _has_access(key: str) -> bool:
    perms = _perms()
    if perms.get("master") is True:
        return True
    return bool(perms.get(key))


def _capssys_public() -> str:
    base = (current_app.config.get("CAPSSYS_PUBLIC_URL") or "").rstrip("/")
    if not base:
        base = (current_app.config.get("CAPSSYS_BASE_URL") or "").rstrip("/")
    return base


def _first_allowed_path() -> str | None:
    # ordem padrão de prioridade (sem permissions)
    order = [
        ("mestre", "/mestre"),
        ("comercial", "/comercial"),
        ("programacao", "/programacao"),
        ("industrial", "/industrial"),
        ("laboratorio", "/laboratorio"),
        ("faturamento", "/faturamento"),
    ]
    for key, path in order:
        if _has_access(key):
            return path
    return None


@main_bp.get("/login")
def login():
    # Se não estiver autenticada no app, manda para o portal (onde o usuário escolhe o módulo)
    capssys_public = _capssys_public()
    if not capssys_public:
        return "CAPSSYS_PUBLIC_URL/CAPSSYS_BASE_URL não configurado no .env", 500
    return redirect(f"{capssys_public}/plataformas")


@main_bp.get("/")
def home():
    # Se ainda não tem sessão no app, manda para login (portal)
    if not session.get("user"):
        return redirect("/login")

    # Se tem sessão, leva para a primeira tela permitida
    dest = _first_allowed_path()
    if dest:
        return redirect(dest)

    # Sem permissões
    return "Sem permissão para acessar qualquer módulo.", 403


@main_bp.get("/logout")
def logout():
    # Limpa sessão do Cap Transportation e manda para login do CAPSSYS
    session.clear()
    capssys_public = _capssys_public()
    if not capssys_public:
        return redirect("/login")
    return redirect(f"{capssys_public}/login")


@main_bp.get("/mestre")
@login_required
def mestre():
    if not _has_access("mestre"):
        return "Sem permissão para Mestre", 403
    return render_template("pages/mestre.html", page="mestre", title="Visão Mestre", active_tab="mestre")


@main_bp.get("/comercial")
@login_required
def comercial():
    if not _has_access("comercial"):
        return "Sem permissão para Comercial", 403
    return render_template("pages/comercial.html", page="comercial", title="Comercial", active_tab="comercial")


@main_bp.get("/programacao")
@login_required
def programacao():
    if not _has_access("programacao"):
        return "Sem permissão para Programação", 403
    return render_template("pages/programacao.html", page="programacao", title="Programação", active_tab="programacao")


@main_bp.get("/industrial")
@login_required
def industrial():
    if not _has_access("industrial"):
        return "Sem permissão para Industrial", 403
    return render_template("pages/industrial.html", page="industrial", title="Industrial / Operações", active_tab="industrial")


@main_bp.get("/laboratorio")
@login_required
def laboratorio():
    if not _has_access("laboratorio"):
        return "Sem permissão para Laboratório", 403
    return render_template("pages/laboratorio.html", page="laboratorio", title="Laboratório", active_tab="laboratorio")


@main_bp.get("/faturamento")
@login_required
def faturamento():
    if not _has_access("faturamento"):
        return "Sem permissão para Faturamento", 403
    return render_template("pages/faturamento.html", page="faturamento", title="Faturamento", active_tab="faturamento")


@main_bp.get("/pedidos/<int:pedido_id>/pdf")
@login_required
def gerar_pdf_pedido(pedido_id):
    from app.models.pedido import Pedido
    p = Pedido.query.get_or_404(pedido_id)

    # Renderiza o template para string
    html = render_template("pages/ov_pdf.html", p=p)

    # Gera o PDF
    result = io.BytesIO()
    pdf = pisa.CreatePDF(io.BytesIO(html.encode("utf-8")), dest=result)

    if pdf.err:
        return f"Erro ao gerar PDF: {pdf.err}", 500

    response = make_response(result.getvalue())
    response.headers["Content-Type"] = "application/pdf"
    response.headers["Content-Disposition"] = f"inline; filename=OV_{p.chave}.pdf"
    return response
