from werkzeug.security import generate_password_hash

secret = "CapTransp@2026!A1"
print(generate_password_hash(secret))
