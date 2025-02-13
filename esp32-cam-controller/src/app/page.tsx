"use client";
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

const ESP_URL = "http://192.168.1.11"; // Asegúrate que esta sea la IP de tu ESP32
const DETECTION_SERVER_URL = "https://optimal-stirring-viper.ngrok-free.app";

export default function Home() {
  const [streaming, setStreaming] = useState(false);
  const [flash, setFlash] = useState(0);
  const [quality, setQuality] = useState(12);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [imageUrl, setImageUrl] = useState(`${ESP_URL}/?getstill=1`);
  const [captureStatus, setCaptureStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLImageElement>(null);
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [streamUrl, setStreamUrl] = useState(`${ESP_URL}/?getstill=1`);
  const [error, setError] = useState("");
  const [detections, setDetections] = useState<
    Array<{
      class: string;
      confidence: number;
      bbox: number[];
    }>
  >([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const detectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!streaming) {
      setStreamUrl(`${ESP_URL}/?getstill=2`);
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
      }
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
      setDetections([]);
      return;
    }

    let isFrameLoading = false;

    const updateFrame = async () => {
      if (isFrameLoading) return;

      try {
        isFrameLoading = true;
        const timestamp = Date.now();
        const newUrl = `${ESP_URL}/?getstill=1&t=${timestamp}`;
        setStreamUrl(newUrl);

        if (isDetecting) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await processDetection(newUrl);
        }

        setError("");
      } catch (err) {
        console.error("Error en stream:", err);
        setError("Error de conexión con la cámara");
        setStreaming(false);
      } finally {
        isFrameLoading = false;
        if (streaming) {
          streamTimeoutRef.current = setTimeout(updateFrame, 500);
        }
      }
    };

    updateFrame();

    return () => {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
      }
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
    };
  }, [streaming, isDetecting]);

  const handleFlash = async (value: number) => {
    try {
      setIsLoading(true);
      console.log("Ajustando flash a:", value);

      // Asegurarse de que el valor esté en el rango correcto
      const flashValue = Math.max(0, Math.min(255, value));

      const response = await fetch(`${ESP_URL}/?flash=${flashValue};stop`);
      if (!response.ok) {
        throw new Error(`Error al ajustar el flash: ${response.statusText}`);
      }

      try {
        const data = await response.json();
        if (data.status === "success") {
          setFlash(data.value);
          setError("");
        } else {
          throw new Error("Error en la respuesta del servidor");
        }
      } catch (parseError) {
        // Si no podemos parsear la respuesta JSON, igual actualizamos el valor
        // ya que el ESP32 probablemente ajustó el flash correctamente
        setFlash(flashValue);
        setError("");
      }
    } catch (err) {
      console.error("Error al ajustar el flash:", err);
      setError("Error al ajustar el flash");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStream = () => {
    setStreaming(!streaming);
  };

  const handleCapture = async () => {
    try {
      setCaptureStatus("Capturando...");

      // Primero obtener la imagen del ESP32
      const response = await fetch(`${ESP_URL}/?getstill=1`);
      if (!response.ok) {
        throw new Error("Error al obtener la imagen de la cámara");
      }

      const imageBlob = await response.blob();

      // Crear FormData para enviar al servidor
      const formData = new FormData();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `captura_${timestamp}.jpg`;
      formData.append("image", imageBlob, filename);

      // Enviar al servidor de guardado
      const saveResponse = await fetch(`${DETECTION_SERVER_URL}/save_image`, {
        method: "POST",
        body: formData,
      });

      if (!saveResponse.ok) {
        throw new Error("Error al guardar la imagen en el servidor");
      }

      const result = await saveResponse.json();

      if (result.success) {
        // Crear URL para previsualización/descarga
        const url = window.URL.createObjectURL(imageBlob);

        // Crear link para descargar
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        setCaptureStatus(`Imagen guardada como: ${result.filename}`);
        setTimeout(() => setCaptureStatus(""), 3000);
      } else {
        throw new Error(result.message || "Error al guardar la imagen");
      }
    } catch (error) {
      console.error("Error al capturar/guardar imagen:", error);
      setCaptureStatus(
        error instanceof Error ? error.message : "Error al procesar la imagen"
      );
    }
  };

  const processDetection = async (imageUrl: string) => {
    try {
      if (!imageUrl) {
        throw new Error("URL de imagen no válida");
      }

      // Obtener la imagen directamente como blob
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error("No se pudo obtener la imagen");
      }
      const imageBlob = await imageResponse.blob();

      // Preparar FormData
      const formData = new FormData();
      formData.append("image", imageBlob, "image.jpg");

      // Hacer la petición al servidor de detección
      const detectResponse = await fetch(`${DETECTION_SERVER_URL}/detect`, {
        method: "POST",
        body: formData,
      });

      if (!detectResponse.ok) {
        throw new Error(`Error en la detección: ${detectResponse.statusText}`);
      }

      const result = await detectResponse.json();

      if (result.status === "success") {
        console.log("Detecciones recibidas:", result.detections);
        setDetections(result.detections);
        setError("");
      } else {
        throw new Error(result.message || "Error en la respuesta del servidor");
      }
    } catch (err) {
      console.error("Error en detección:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Error en la detección de objetos";
      setError(errorMessage);

      // Solo desactivar la detección si es un error de conexión
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setIsDetecting(false);
      }
    }
  };

  const BoundingBoxes = () => {
    return (
      <div className="absolute inset-0">
        {detections.map((detection, index) => {
          const [x1, y1, x2, y2] = detection.bbox;
          return (
            <div
              key={index}
              style={{
                position: "absolute",
                left: `${(x1 / 640) * 100}%`,
                top: `${(y1 / 480) * 100}%`,
                width: `${((x2 - x1) / 640) * 100}%`,
                height: `${((y2 - y1) / 480) * 100}%`,
                border: "3px solid #00ff00",
                backgroundColor: "rgba(0, 255, 0, 0.2)",
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "-25px",
                  left: "0",
                  backgroundColor: "#00ff00",
                  color: "white",
                  padding: "2px 6px",
                  fontSize: "14px",
                  borderRadius: "4px",
                  whiteSpace: "nowrap",
                  fontWeight: "bold",
                  zIndex: 11,
                }}
              >
                {`${detection.class} ${(detection.confidence * 100).toFixed(
                  1
                )}%`}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const handleDetection = () => {
    if (!streaming) {
      setError("Debes iniciar el stream antes de activar la detección");
      return;
    }
    setIsDetecting(!isDetecting);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div
            className="border-4 border-dashed border-gray-200 rounded-lg overflow-hidden"
            style={{ height: "480px" }}
          >
            <div className="relative w-full h-full">
              <img
                src={streamUrl}
                className="absolute top-0 left-0 w-full h-full object-contain"
                alt="ESP32-CAM Stream"
                onError={() => {
                  setError("Error al cargar la imagen");
                  setStreaming(false);
                }}
              />
              <BoundingBoxes />
              {error && (
                <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 text-center z-20">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Flash Control */}
            <div className="px-4 py-5 bg-white shadow rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium text-gray-900">Flash</h3>
                <span className="text-sm text-gray-500">{flash}</span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                value={flash}
                onChange={(e) => {
                  const newValue = Number(e.target.value);
                  if (!isLoading) {
                    handleFlash(newValue);
                  }
                }}
                className="w-full"
                disabled={isLoading}
              />
              {isLoading && (
                <div className="mt-2 text-sm text-blue-500">
                  Ajustando flash...
                </div>
              )}
              <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>Off</span>
                <span>Max</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  onClick={() => !isLoading && handleFlash(0)}
                  disabled={isLoading}
                  className={`px-2 py-1 text-sm rounded ${
                    isLoading
                      ? "bg-gray-300 cursor-not-allowed"
                      : flash === 0
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  Off
                </button>
                <button
                  onClick={() => !isLoading && handleFlash(128)}
                  disabled={isLoading}
                  className={`px-2 py-1 text-sm rounded ${
                    isLoading
                      ? "bg-gray-300 cursor-not-allowed"
                      : flash === 128
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  50%
                </button>
                <button
                  onClick={() => !isLoading && handleFlash(255)}
                  disabled={isLoading}
                  className={`px-2 py-1 text-sm rounded ${
                    isLoading
                      ? "bg-gray-300 cursor-not-allowed"
                      : flash === 255
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  Max
                </button>
              </div>
            </div>

            {/* Stream Control */}
            <div className="px-4 py-5 bg-white shadow rounded-lg">
              <button
                onClick={handleStream}
                className={`w-full px-4 py-2 rounded-md ${
                  streaming
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                } text-white`}
              >
                {streaming ? "Stop Stream" : "Start Stream"}
              </button>
            </div>

            {/* Capture Button */}
            <div className="px-4 py-5 bg-white shadow rounded-lg">
              <button
                onClick={handleCapture}
                className="w-full px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white"
              >
                Capturar Imagen
              </button>
              {captureStatus && (
                <p
                  className={`mt-2 text-sm ${
                    captureStatus.includes("Error")
                      ? "text-red-500"
                      : "text-green-500"
                  }`}
                >
                  {captureStatus}
                </p>
              )}
            </div>

            {/* Quality Control */}
            <div className="px-4 py-5 bg-white shadow rounded-lg">
              <h3 className="text-lg font-medium text-gray-900">Quality</h3>
              <input
                type="range"
                min="10"
                max="63"
                value={quality}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setQuality(value);
                  axios.get(`${ESP_URL}/?quality=${value};stop`);
                }}
                className="w-full mt-2"
              />
              <span className="text-sm text-gray-500">{quality}</span>
            </div>

            {/* Brightness Control */}
            <div className="px-4 py-5 bg-white shadow rounded-lg">
              <h3 className="text-lg font-medium text-gray-900">Brightness</h3>
              <input
                type="range"
                min="-2"
                max="2"
                step="1"
                value={brightness}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setBrightness(value);
                  axios.get(`${ESP_URL}/?brightness=${value};stop`);
                }}
                className="w-full mt-2"
              />
              <span className="text-sm text-gray-500">{brightness}</span>
            </div>

            {/* Contrast Control */}
            <div className="px-4 py-5 bg-white shadow rounded-lg">
              <h3 className="text-lg font-medium text-gray-900">Contrast</h3>
              <input
                type="range"
                min="-2"
                max="2"
                step="1"
                value={contrast}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setContrast(value);
                  axios.get(`${ESP_URL}/?contrast=${value};stop`);
                }}
                className="w-full mt-2"
              />
              <span className="text-sm text-gray-500">{contrast}</span>
            </div>

            {/* Detection Control */}
            <div className="px-4 py-5 bg-white shadow rounded-lg">
              <button
                onClick={handleDetection}
                disabled={!streaming}
                className={`w-full px-4 py-2 rounded-md ${
                  !streaming
                    ? "bg-gray-400 cursor-not-allowed"
                    : isDetecting
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-purple-600 hover:bg-purple-700"
                } text-white`}
              >
                {!streaming
                  ? "Inicia el stream primero"
                  : isDetecting
                  ? "Stop Detection"
                  : "Start Detection"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
