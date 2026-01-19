# app/__init__.py
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    # ============================================================
    # Config (fallback para diferentes layouts de projeto)
    # ============================================================
    # Cenário A: config.py no root do projeto (ex.: /app/config.py)  -> from config import Config
    # Cenário B: config.py dentro do pacote app (ex.: /app/app/config.py) -> from app.config import Config
    try:
        from config import Config  # type: ignore
    except ModuleNotFoundError:
        from app.config import Config  # type: ignore

    app.config.from_object(Config)

    # ============================================================
    # Blueprints
    # ============================================================
    from .routes import main
    app.register_blueprint(main.main_bp)

    return app
