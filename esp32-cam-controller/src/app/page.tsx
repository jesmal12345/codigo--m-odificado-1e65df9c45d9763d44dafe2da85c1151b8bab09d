"use client";
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

const ESP_URL = "http://192.168.1.11"; // Asegúrate que esta sea la IP de tu ESP32

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

  useEffect(() => {
    if (!streaming) {
      setStreamUrl(`${ESP_URL}/?getstill=1`);
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
      }
      return;
    }

    let isFrameLoading = false;

    const updateFrame = async () => {
      if (isFrameLoading) return;

      try {
        isFrameLoading = true;
        const timestamp = Date.now();
        const newUrl = `${ESP_URL}/?getstill=1&t=${timestamp}`;

        const img = new Image();
        img.src = newUrl;

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        setStreamUrl(newUrl);
        setError("");
      } catch (err) {
        console.error("Error en stream:", err);
        setError("Error de conexión con la cámara");
        setStreaming(false);
      } finally {
        isFrameLoading = false;
      }

      if (streaming) {
        streamTimeoutRef.current = setTimeout(updateFrame, 100);
      }
    };

    updateFrame();

    return () => {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
      }
    };
  }, [streaming]);

  const handleFlash = async (value: number) => {
    try {
      await axios.get(`${ESP_URL}/?flash=${value};stop`);
      setFlash(value);
    } catch (error) {
      console.error("Error setting flash:", error);
    }
  };

  const handleStream = () => {
    setStreaming(!streaming);
  };

  const handleCapture = async () => {
    try {
      setCaptureStatus("Capturando...");
      const response = await axios.get(`${ESP_URL}/?capture=1;stop`, {
        responseType: "blob",
      });

      // Crear URL para la imagen
      const url = window.URL.createObjectURL(new Blob([response.data]));

      // Crear link para descargar
      const link = document.createElement("a");
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.setAttribute("download", `captura_${timestamp}.jpg`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      setCaptureStatus("Imagen capturada y descargada exitosamente");
      setTimeout(() => setCaptureStatus(""), 3000);
    } catch (error) {
      console.error("Error capturing image:", error);
      setCaptureStatus("Error al capturar la imagen");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg h-96">
            <div className="relative w-full h-full">
              <img
                src={streamUrl}
                className="w-full h-full object-contain"
                alt="ESP32-CAM Stream"
                onError={() => {
                  setError("Error al cargar la imagen");
                  setStreaming(false);
                }}
              />
              {error && (
                <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 text-center">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Flash Control */}
            <div className="px-4 py-5 bg-white shadow rounded-lg">
              <h3 className="text-lg font-medium text-gray-900">Flash</h3>
              <input
                type="range"
                min="0"
                max="255"
                value={flash}
                onChange={(e) => handleFlash(Number(e.target.value))}
                className="w-full mt-2"
              />
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
          </div>
        </div>
      </div>
    </div>
  );
}
