from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
from ultralytics import YOLO

app = Flask(__name__)
CORS(app)

# Cargar el modelo YOLOv8 y configurar parámetros
model = YOLO('yolov8n.pt')
model.conf = 0.5  # Umbral de confianza
model.iou = 0.5   # Umbral IOU

@app.route('/detect', methods=['POST'])
def detect_objects():
    try:
        # Obtener la imagen del POST
        file = request.files['image']
        nparr = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, threaded=True) 