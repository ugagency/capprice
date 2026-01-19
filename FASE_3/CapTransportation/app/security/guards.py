# app/security/guards.py
from functools import wraps
from flask import session, redirect, request, jsonify


def login_required(view_fn):
    @wraps(view_fn)
    def wrapper(*args, **kwargs):
        if not session.get("user"):
            # Para páginas, manda para o login do portal (via /login do próprio app)
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "message": "Não autenticado"}), 401
            return redirect("/login")
        return view_fn(*args, **kwargs)
    return wrapper


def require_admin(view_fn):
    @wraps(view_fn)
    def wrapper(*args, **kwargs):
        user = session.get("user")
        if not user:
            return jsonify({"ok": False, "message": "Não autenticado"}), 401

        roles = user.get("roles") or []
        if "ADMIN" not in roles:
            return jsonify({"ok": False, "message": "Acesso negado"}), 403

        return view_fn(*args, **kwargs)
    return wrapper
