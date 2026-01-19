# capssys/app/__init__.py
from flask import Flask

from .config import Settings, init_db_pool
from .routes.auth_routes import auth_bp
from .routes.admin_routes import admin_bp
from .routes.modules_routes import modules_bp
from .routes.sso_routes import sso_bp

# ✅ Import seguro (o circular estava no admin_app_permissions importando "from app import db")
from .routes.admin_app_permissions import admin_app_perms_api


def create_app():
    app = Flask(__name__, template_folder="templates", static_folder="static")

    settings = Settings()
    app.config["SECRET_KEY"] = settings.SECRET_KEY
    app.config["DATABASE_URL"] = settings.DATABASE_URL

    # Mantém seu pool atual (se existir)
    init_db_pool(app)

    # Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(modules_bp)
    app.register_blueprint(sso_bp)

    # ✅ Sem url_prefix aqui, pois as rotas do blueprint já incluem "/api/..."
    app.register_blueprint(admin_app_perms_api)

    return app
