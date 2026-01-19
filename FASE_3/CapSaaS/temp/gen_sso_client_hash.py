from werkzeug.security import generate_password_hash

secret = "capprice-local-secret-123"
print(generate_password_hash(secret))
