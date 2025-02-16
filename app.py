from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import os
import sys
import torch
from datetime import datetime
from dotenv import load_dotenv

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

# Agregar la ruta de la carpeta para guardar imágenes
CAPTURE_FOLDER = "captured_images"

# Asegurarse de que la carpeta existe
if not os.path.exists(CAPTURE_FOLDER):
    os.makedirs(CAPTURE_FOLDER)

load_dotenv()  # Cargar variables de entorno desde .env

@app.route('/detect', methods=['POST'])
def detect_objects():
    try:
        file = request.files['image']
        nparr = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({'status': 'error', 'message': 'No se pudo decodificar la imagen'}), 400
        
        # Reducir resolución para procesamiento más rápido pero mantener aspecto
        scale_percent = 50 # porcentaje del tamaño original
        width = int(img.shape[1] * scale_percent / 100)
        height = int(img.shape[0] * scale_percent / 100)
        dim = (width, height)
        img_resized = cv2.resize(img, dim, interpolation = cv2.INTER_AREA)
        
        # Realizar la detección en la imagen reducida
        results = model(img_resized, verbose=False)  # Desactivar verbose para mayor velocidad
        result = results[0]
        
        # Cache para evitar detecciones repetidas
        current_detections = set()
        detections = []
        
        if result.boxes:
            for box in result.boxes:
                if box.conf[0] > 0.4:  # Aumentar umbral para reducir falsos positivos
                    class_name = result.names[int(box.cls[0])]
                    
                    # Escalar coordenadas de vuelta al tamaño original
                    xyxy = box.xyxy[0].tolist()
                    xyxy = [
                        xyxy[0] * (100/scale_percent),
                        xyxy[1] * (100/scale_percent),
                        xyxy[2] * (100/scale_percent),
                        xyxy[3] * (100/scale_percent)
                    ]
                    
                    # Solo agregar si es una detección nueva
                    detection_key = f"{class_name}_{int(xyxy[0])}_{int(xyxy[1])}"
                    if detection_key not in current_detections:
                        current_detections.add(detection_key)
                        detections.append({
                            'class': class_name,
                            'confidence': float(box.conf[0]),
                            'bbox': xyxy
                        })
        
        return jsonify({
            'status': 'success',
            'detections': detections,
            'image_size': {'width': img.shape[1], 'height': img.shape[0]}
        })
        
    except Exception as e:
        print(f"Error en detección: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'message': 'El servidor está funcionando correctamente'
    })

@app.route('/save_image', methods=['POST'])
def save_image():
    try:
        if 'image' not in request.files:
            return jsonify({
                'success': False,
                'message': 'No se encontró imagen en la petición'
            }), 400

        file = request.files['image']
        if not file:
            return jsonify({
                'success': False,
                'message': 'Archivo de imagen vacío'
            }), 400

        # Crear nombre de archivo con timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'captura_{timestamp}.jpg'
        
        # Ruta completa donde se guardará la imagen
        filepath = os.path.join(CAPTURE_FOLDER, filename)

        # Guardar la imagen
        file.save(filepath)

        print(f"Imagen guardada en: {filepath}")

        return jsonify({
            'success': True,
            'message': 'Imagen guardada exitosamente',
            'filename': filename,
            'filepath': filepath
        })

    except Exception as e:
        print(f"Error al guardar la imagen: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error al guardar la imagen: {str(e)}'
        }), 500

if __name__ == '__main__':
    # Usar el puerto desde las variables de entorno
    port = int(os.environ.get('PORT', 10000))
    # Asegurarse de que el servidor esté accesible desde cualquier dirección IP
    app.run(host='0.0.0.0', port=port, debug=False) 