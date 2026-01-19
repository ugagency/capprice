# Dockerfile
# Use uma imagem Python oficial
FROM python:3.10-slim

# Define o diretório de trabalho
WORKDIR /app

# Copia o arquivo de dependências
COPY requirements.txt .

# Instala as dependências
RUN pip install --no-cache-dir -r requirements.txt

# Copia o restante do código da aplicação
COPY . .

# Expõe a porta que o Gunicorn usará
EXPOSE 5000

# Command to run the application with Gunicorn
# Fixed for Render: Use $PORT if available, else 5000
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5000} --timeout 500 run:app"]