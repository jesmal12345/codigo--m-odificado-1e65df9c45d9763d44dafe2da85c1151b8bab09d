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

# Descargar modelo YOLOv8n (si no está incluido en el repo)
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

CMD ["gunicorn", "--bind", "0.0.0.0:${PORT}", "--workers", "4", "app:app"]