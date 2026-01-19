FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir --upgrade pip

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

# Fixed for Render: Auto-init DB then start Gunicorn
CMD ["sh", "-c", "python init_db_render.py && gunicorn -w 2 -b 0.0.0.0:${PORT:-5000} 'app:create_app()'"]
