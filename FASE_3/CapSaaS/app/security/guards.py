# app/security/guards.py
from functools import wraps
from flask import session, redirect, url_for, jsonify, request


def login_required(view_fn):
    @wraps(view_fn)
    def wrapper(*args, **kwargs):
        if not session.get("user"):
            return redirect(url_for("auth.home"))
        return view_fn(*args, **kwargs)
    return wrapper


def require_admin(view_fn):
    """
    Admin no CAPSSYS é papel do portal (role ADMIN).
    - Para APIs: retorna JSON 401/403
    - Para páginas: redireciona para /plataformas ou mostra 403 simples
    """
    @wraps(view_fn)
    def wrapper(*args, **kwargs):
        user = session.get("user")
        if not user:
            # API => JSON
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "message": "Não autenticado"}), 401
            return redirect(url_for("auth.home"))

        roles = user.get("roles") or []
        if "ADMIN" not in roles:
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "message": "Acesso negado"}), 403
            # Página HTML: volta para plataformas (melhor UX)
            return redirect(url_for("auth.plataformas"))

        return view_fn(*args, **kwargs)
    return wrapper
