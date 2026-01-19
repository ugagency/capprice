# app/routes/modules_routes.py
from flask import Blueprint, redirect, render_template
from app.security.guards import login_required

modules_bp = Blueprint("modules", __name__)


@modules_bp.get("/operacional")
@login_required
def operacional():
    return "<h1>Gestão Operacional (em construção)</h1>"


@modules_bp.get("/bi")
@login_required
def bi():
    return redirect("/sso/start/captransportation")
