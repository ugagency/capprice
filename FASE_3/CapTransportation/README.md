# Cap Transportation (Flask + Docker)

## Requisitos
- Docker e Docker Compose
- PostgreSQL rodando fora do Docker (host/VM/serviço gerenciado)

## Estrutura
- app/ (Flask app: routes, models, templates, static)
- run.py (entrypoint do Gunicorn)
- Dockerfile / docker-compose.yml
- .env

## Configuração do Banco (PostgreSQL externo)
Crie o banco e usuário (exemplo):

```sql
CREATE DATABASE captransportation_bd;
CREATE USER captransportation_app WITH PASSWORD 'troque-essa-senha';
GRANT ALL PRIVILEGES ON DATABASE captransportation_bd TO captransportation_app;
