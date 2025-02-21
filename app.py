from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import os
import sys
import torch
from datetime import datetime
from dotenv import load_dotenv

# Configurar variables de entorno
os.environ['OPENCV_IO_ENABLE_JASPER'] = '1'
os.environ['PYTORCH_JIT'] = '0'  # Deshabilitar JIT para reducir memoria
os.environ['MKL_NUM_THREADS'] = '1'  # Limitar threads de MKL
os.environ['OMP_NUM_THREADS'] = '1'  # Limitar threads de OpenMP
# Limitar el uso de memoria de PyTorch
torch.cuda.empty_cache()
torch.backends.cudnn.benchmark = False
torch.backends.cudnn.enabled = False  # Deshabilitar cuDNN

app = Flask(__name__)
CORS(app)

# Definir las clases que queremos detectar
CLASSES = {
    0: 'person',
    1: 'clock',
    2: 'cat'
}

# Cargar modelo de forma más eficiente
try:
    from ultralytics import YOLO
    model = YOLO('custom_model.pt', task='detect')
    # Configurar para menor uso de memoria
    model.conf = 0.6  # Umbral de confianza
    model.iou = 0.5   # Umbral IOU
    model.max_det = 5 # Máximo 5 detecciones
    
    # Forzar modo CPU y optimizaciones de memoria
    model.to('cpu')
    torch.set_num_threads(1)
    
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
        
        # Reducir resolución
        scale_percent = 30
        width = int(img.shape[1] * scale_percent / 100)
        height = int(img.shape[0] * scale_percent / 100)
        img_resized = cv2.resize(img, (width, height), interpolation=cv2.INTER_AREA)
        
        # Liberar memoria
        del img
        torch.cuda.empty_cache()
        
        # Realizar detección solo de las clases especificadas
        results = model(img_resized, verbose=False)
        result = results[0]
        
        detections = []
        if result.boxes:
            for box in result.boxes:
                class_id = int(box.cls[0])
                if class_id in CLASSES and box.conf[0] > 0.6:
                    class_name = CLASSES[class_id]
                    xyxy = box.xyxy[0].tolist()
                    xyxy = [
                        xyxy[0] * (100/scale_percent),
                        xyxy[1] * (100/scale_percent),
                        xyxy[2] * (100/scale_percent),
                        xyxy[3] * (100/scale_percent)
                    ]
                    detections.append({
                        'class': class_name,
                        'confidence': float(box.conf[0]),
                        'bbox': xyxy
                    })
        
        # Liberar memoria
        del results
        del result
        torch.cuda.empty_cache()
        
        return jsonify({
            'status': 'success',
            'detections': detections
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
    # Configurar Gunicorn para menor uso de memoria
    port = int(os.environ.get('PORT', 10000))
    app.run(
        host='0.0.0.0', 
        port=port,
        debug=False,
        threaded=False,  # Deshabilitar threading
        processes=1      # Un solo proceso
    ) 