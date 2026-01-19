# app/__init__.py
from flask import Flask, session, g
from flask_sqlalchemy import SQLAlchemy
from app.config import Settings

db = SQLAlchemy()


def _normalize_user(u):
    if not u:
        return None

    if isinstance(u, dict):
        return {
            "user_id": u.get("user_id") or u.get("id") or u.get("sub"),
            "email": u.get("email"),
            "name": u.get("name") or u.get("nome"),
            "roles": u.get("roles", []) or [],
            "permissions": u.get("permissions") or {},
        }

    # fallback objeto
    return {
        "user_id": getattr(u, "user_id", None) or getattr(u, "id", None),
        "email": getattr(u, "email", None),
        "name": getattr(u, "name", None),
        "roles": getattr(u, "roles", []) or [],
        "permissions": getattr(u, "permissions", {}) or {},
    }


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config.from_object(Settings())

    db.init_app(app)

    # SSO -> g.user
    from app.security.sso import load_current_user
    app.before_request(load_current_user)

    @app.context_processor
    def inject_user_context():
        sess_user = session.get("user")
        g_user = getattr(g, "user", None)

        user = _normalize_user(sess_user) or _normalize_user(g_user)
        permissions = user.get("permissions") if user else {}

        return {"user": user, "permissions": permissions}

    from app.routes.main_routes import main_bp
    from app.routes.api_routes import api_bp
    from app.routes.sso_routes import sso_cb

    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(sso_cb)

    return app
