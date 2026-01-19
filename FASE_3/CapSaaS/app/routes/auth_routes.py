# app/routes/auth_routes.py
from flask import Blueprint, render_template, jsonify, session, request, redirect, url_for, current_app
from app.services.auth_service import authenticate_user

auth_bp = Blueprint("auth", __name__)


def _is_logged():
    return bool(session.get("user"))


@auth_bp.get("/")
def home():
    if _is_logged():
        return redirect(url_for("auth.plataformas"))
    return render_template("pages/login.html", page="login")


@auth_bp.get("/plataformas")
def plataformas():
    if not _is_logged():
        return redirect(url_for("auth.home"))
    return render_template("pages/plataformas.html", page="plataformas")


@auth_bp.post("/api/login")
def api_login():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or data.get("username") or "").strip()
    password = (data.get("password") or data.get("senha") or "").strip()

    if not email or not password:
        return jsonify({"ok": False, "message": "Informe e-mail e senha."}), 400

    ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    user_agent = request.headers.get("User-Agent")

    try:
        result = authenticate_user(email=email, password=password, ip=ip, user_agent=user_agent)
    except Exception as e:
        current_app.logger.exception(f"[api_login] erro inesperado no authenticate_user: {e}")
        return jsonify({"ok": False, "message": "Erro interno"}), 500

    if not result.ok:
        current_app.logger.warning(f"[api_login] acesso negado para email={email} ip={ip} ua={(user_agent or '')[:80]}")
        return jsonify({"ok": False, "message": result.message or "Acesso negado. Verifique os dados."}), 401

    # Normaliza formato da sessão
    u = result.user or {}
    if not isinstance(u, dict):
        u = {}

    u.setdefault("roles", [])
    u.setdefault("name", u.get("nome") or "")
    u.setdefault("email", u.get("email") or email)
    u.setdefault("user_id", u.get("user_id") or u.get("id"))

    session["user"] = u
    session.modified = True

    return jsonify({"ok": True, "redirect": "/plataformas"}), 200


@auth_bp.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True, "redirect": "/"}), 200
