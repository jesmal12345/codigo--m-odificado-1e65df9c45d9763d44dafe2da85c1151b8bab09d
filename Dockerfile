FROM python:3.9-slim

WORKDIR /app

# Instalar dependencias del sistema (OpenCV y otras)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements e instalar
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar la aplicación y el modelo
COPY . .

# Descargar y configurar modelo YOLOv8n-custom
RUN python -c "from ultralytics import YOLO; model = YOLO('yolov8n.pt'); model.model.names = {0: 'person', 1: 'clock', 2: 'cat'}; model.export('custom_model.pt')"

# Exponemos el puerto 10000
EXPOSE 10000

# Usar solo 1 worker para reducir uso de memoria
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "--workers", "1", "--threads", "1", "--timeout", "30", "--max-requests", "100", "--max-requests-jitter", "10", "app:app"]