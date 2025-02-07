FROM python:3.9-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos necesarios
COPY requirements.txt .
COPY detector_server.py .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Descargar el modelo YOLOv8 durante la construcción
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

# Exponer el puerto
EXPOSE 5000

# Comando para ejecutar la aplicación
CMD ["python", "detector_server.py"] 