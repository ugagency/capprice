# app/routes/admin_routes.py
from flask import Blueprint, render_template, session, redirect, url_for, jsonify, request
from app.security.guards import require_admin

from app.services.admin_service import (
    admin_list_users,
    admin_list_roles,
    admin_list_permissions,
    admin_reset_password,
    admin_create_user,
    admin_get_user,
    admin_update_user,
    admin_toggle_user_active,

    # ROLES / NÍVEIS
    admin_create_role,
    admin_update_role,
    admin_toggle_role_active,
    admin_get_role_permissions,
    admin_set_role_permissions,
    admin_delete_role,  # NOVO
)

admin_bp = Blueprint("admin", __name__)


def _is_logged():
    return bool(session.get("user"))


@admin_bp.get("/admin")
def admin_home():
    if not _is_logged():
        return redirect(url_for("auth.home"))

    guarded = require_admin(lambda: render_template("pages/admin.html", page="admin"))
    return guarded()


# ===============================
# APIs
# ===============================

@admin_bp.get("/api/admin/users")
def api_admin_users():
    return require_admin(lambda: jsonify({"ok": True, "users": admin_list_users()}))()


@admin_bp.get("/api/admin/users/<user_id>")
def api_admin_get_user(user_id):
    return require_admin(lambda: jsonify({"ok": True, "user": admin_get_user(user_id)}))()


@admin_bp.post("/api/admin/users")
def api_admin_create_user():
    def _do():
        data = request.get_json(silent=True) or {}
        return admin_create_user(data)
    return require_admin(_do)()


@admin_bp.put("/api/admin/users/<user_id>")
def api_admin_update_user(user_id):
    def _do():
        data = request.get_json(silent=True) or {}
        return admin_update_user(user_id, data)
    return require_admin(_do)()


@admin_bp.post("/api/admin/users/<user_id>/toggle-active")
def api_admin_toggle_active(user_id):
    return require_admin(lambda: admin_toggle_user_active(user_id))()


@admin_bp.post("/api/admin/users/<user_id>/reset-password")
def api_admin_reset_password(user_id):
    def _do():
        data = request.get_json(silent=True) or {}
        return admin_reset_password(user_id, data)
    return require_admin(_do)()


# -------------------------------
# ROLES / NÍVEIS
# -------------------------------

@admin_bp.get("/api/admin/roles")
def api_admin_roles():
    return require_admin(lambda: jsonify({"ok": True, "roles": admin_list_roles()}))()


@admin_bp.post("/api/admin/roles")
def api_admin_create_role():
    def _do():
        data = request.get_json(silent=True) or {}
        return admin_create_role(data)
    return require_admin(_do)()


@admin_bp.put("/api/admin/roles/<role_id>")
def api_admin_update_role(role_id):
    def _do():
        data = request.get_json(silent=True) or {}
        return admin_update_role(role_id, data)
    return require_admin(_do)()


@admin_bp.post("/api/admin/roles/<role_id>/toggle-active")
def api_admin_toggle_role(role_id):
    return require_admin(lambda: admin_toggle_role_active(role_id))()


@admin_bp.get("/api/admin/roles/<role_id>/permissions")
def api_admin_role_permissions(role_id):
    return require_admin(lambda: jsonify({"ok": True, "perm_ids": admin_get_role_permissions(role_id)}))()


@admin_bp.put("/api/admin/roles/<role_id>/permissions")
def api_admin_set_role_permissions(role_id):
    def _do():
        data = request.get_json(silent=True) or {}
        perm_ids = data.get("perm_ids") or []
        return admin_set_role_permissions(role_id, perm_ids)
    return require_admin(_do)()


@admin_bp.delete("/api/admin/roles/<role_id>")
def api_admin_delete_role(role_id):
    return require_admin(lambda: admin_delete_role(role_id))()


@admin_bp.get("/api/admin/permissions")
def api_admin_permissions():
    return require_admin(lambda: jsonify({"ok": True, "permissions": admin_list_permissions()}))()
