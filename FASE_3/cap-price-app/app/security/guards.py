# app/security/guards.py
from functools import wraps
from flask import session, redirect, request, jsonify, url_for


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user"):
            # Se for API, responde JSON
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "message": "Não autenticado"}), 401

            # Se for página, redireciona para a rota login (que agora redireciona CAPSSYS)
            return redirect(url_for("main.login"))

        return fn(*args, **kwargs)

    return wrapper
