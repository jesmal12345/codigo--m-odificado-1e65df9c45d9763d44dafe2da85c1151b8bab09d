from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import os
import sys
import torch

# Configurar variables de entorno para OpenCV
os.environ['OPENCV_IO_ENABLE_JASPER'] = '1'

# Configurar PyTorch para permitir la carga segura del modelo
torch.serialization.add_safe_globals(['ultralytics.nn.tasks.DetectionModel'])

app = Flask(__name__)
CORS(app)

try:
    from ultralytics import YOLO
    # Cargar el modelo YOLOv8 con configuración específica
    model = YOLO('yolov8n.pt', task='detect')
    model.conf = 0.5  # Umbral de confianza
    model.iou = 0.5   # Umbral IOU
    
    # Forzar la carga del modelo con weights_only=False
    if not hasattr(model, 'model'):
        model.model = torch.load('yolov8n.pt', weights_only=False)
except Exception as e:
    print(f"Error al cargar YOLO: {e}")
    sys.exit(1)

@app.route('/detect', methods=['POST'])
def detect_objects():
    try:
        # Obtener la imagen del POST
        file = request.files['image']
        nparr = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({
                'status': 'error',
                'message': 'No se pudo decodificar la imagen'
            }), 400
        
        # Redimensionar la imagen para procesamiento más rápido
        img = cv2.resize(img, (600, 800))
        
        # Realizar la detección
        results = model(img)
        result = results[0]  # Obtener el primer resultado
        
        detections = []
        if result.boxes:
            for box in result.boxes:
                if box.conf[0] > 0.5:
                    obj = {
                        'class': result.names[int(box.cls[0])],
                        'confidence': float(box.conf[0]),
                        'bbox': box.xyxy[0].tolist()
                    }
                    detections.append(obj)
        
        return jsonify({
            'status': 'success',
            'detections': detections
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'message': 'El servidor está funcionando correctamente'
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port) 