import { useRef, useState, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import type * as blazefaceModule from "@tensorflow-models/blazeface";

// Use the actual types from blazeface
type BlazeFaceModel = blazefaceModule.BlazeFaceModel;
type NormalizedFace = blazefaceModule.NormalizedFace;

// Helper functions to extract values from tensors or arrays
function getCoordinates(value: number[] | tf.Tensor1D): [number, number] {
  if (Array.isArray(value)) {
    return [value[0], value[1]];
  }
  // If it's a tensor, we need to get the data synchronously
  const data = value.dataSync();
  return [data[0], data[1]];
}

function getProbabilityValue(value: number | tf.Tensor1D | undefined): number {
  if (value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  // If it's a tensor, get the first value
  const data = value.dataSync();
  return data[0];
}

export interface FaceDetectionResult {
  faceCount: number;
  status: "no_face" | "single_face" | "multiple_faces";
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  message: string;
  isValid: boolean;
}

interface UseFaceDetectionReturn {
  isModelLoading: boolean;
  isDetecting: boolean;
  modelError: string | null;
  loadModel: () => Promise<boolean>;
  detectFaces: (
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  ) => Promise<FaceDetectionResult>;
  detectFacesFromDataUrl: (dataUrl: string) => Promise<FaceDetectionResult>;
}

export function useFaceDetection(): UseFaceDetectionReturn {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const modelRef = useRef<BlazeFaceModel | null>(null);
  const modelLoadingRef = useRef(false);

  // Load the blazeface model
  const loadModel = useCallback(async (): Promise<boolean> => {
    // Already loaded
    if (modelRef.current) return true;
    
    // Already loading
    if (modelLoadingRef.current) {
      // Wait for loading to complete
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!modelLoadingRef.current) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
      return !!modelRef.current;
    }

    modelLoadingRef.current = true;
    setIsModelLoading(true);
    setModelError(null);

    try {
      // Ensure TensorFlow.js is ready
      await tf.ready();
      
      // Set backend to webgl for better performance
      if (tf.getBackend() !== "webgl") {
        try {
          await tf.setBackend("webgl");
        } catch {
          // Fall back to cpu if webgl not available
          await tf.setBackend("cpu");
        }
      }

      // Dynamic import of blazeface
      const blazeface = await import("@tensorflow-models/blazeface");
      const model = await blazeface.load();
      
      modelRef.current = model;
      console.log("[FaceDetection] Model loaded successfully");
      return true;
    } catch (error) {
      console.error("[FaceDetection] Model load error:", error);
      setModelError("Failed to load face detection model");
      return false;
    } finally {
      setIsModelLoading(false);
      modelLoadingRef.current = false;
    }
  }, []);

  // Detect faces in a video/image/canvas element
  const detectFaces = useCallback(
    async (
      source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
    ): Promise<FaceDetectionResult> => {
      setIsDetecting(true);

      try {
        // Ensure model is loaded
        if (!modelRef.current) {
          const loaded = await loadModel();
          if (!loaded || !modelRef.current) {
            return {
              faceCount: 0,
              status: "no_face",
              confidence: 0,
              message: "Face detection model not available",
              isValid: false,
            };
          }
        }

        // Run detection
        const predictions: NormalizedFace[] = await modelRef.current.estimateFaces(source, false);
        
        // Filter predictions by confidence (only keep faces with >70% confidence)
        const confidentFaces = predictions.filter((pred) => {
          const prob = getProbabilityValue(pred.probability);
          return prob > 0.7;
        });

        const faceCount = confidentFaces.length;

        if (faceCount === 0) {
          return {
            faceCount: 0,
            status: "no_face",
            confidence: 0,
            message: "No face detected. Please position your face clearly in the frame.",
            isValid: false,
          };
        }

        if (faceCount > 1) {
          return {
            faceCount,
            status: "multiple_faces",
            confidence: 0.9,
            message: `${faceCount} faces detected. Only you should be visible in the frame.`,
            isValid: false,
          };
        }

        // Single face detected - get bounding box
        const face = confidentFaces[0];
        const topLeft = getCoordinates(face.topLeft);
        const bottomRight = getCoordinates(face.bottomRight);
        const probability = getProbabilityValue(face.probability);

        const boundingBox = {
          x: topLeft[0],
          y: topLeft[1],
          width: bottomRight[0] - topLeft[0],
          height: bottomRight[1] - topLeft[1],
        };

        // Check if face is large enough (at least 80x80 pixels)
        if (boundingBox.width < 80 || boundingBox.height < 80) {
          return {
            faceCount: 1,
            status: "no_face",
            confidence: probability,
            boundingBox,
            message: "Face too small. Please move closer to the camera.",
            isValid: false,
          };
        }

        return {
          faceCount: 1,
          status: "single_face",
          confidence: probability,
          boundingBox,
          message: "Face detected successfully!",
          isValid: true,
        };
      } catch (error) {
        console.error("[FaceDetection] Detection error:", error);
        return {
          faceCount: 0,
          status: "no_face",
          confidence: 0,
          message: "Face detection failed. Please try again.",
          isValid: false,
        };
      } finally {
        setIsDetecting(false);
      }
    },
    [loadModel]
  );

  // Detect faces from a base64 data URL
  const detectFacesFromDataUrl = useCallback(
    async (dataUrl: string): Promise<FaceDetectionResult> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = async () => {
          const result = await detectFaces(img);
          resolve(result);
        };
        img.onerror = () => {
          resolve({
            faceCount: 0,
            status: "no_face",
            confidence: 0,
            message: "Failed to load image for face detection.",
            isValid: false,
          });
        };
        img.src = dataUrl;
      });
    },
    [detectFaces]
  );

  return {
    isModelLoading,
    isDetecting,
    modelError,
    loadModel,
    detectFaces,
    detectFacesFromDataUrl,
  };
}

export default useFaceDetection;

