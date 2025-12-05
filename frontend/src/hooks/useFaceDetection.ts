import { useRef, useState, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";

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
  const faceMeshRef = useRef<any>(null);
  const modelLoadingRef = useRef(false);

  // Load the FaceMesh model (same as used in assessment proctoring)
  const loadModel = useCallback(async (): Promise<boolean> => {
    // Already loaded
    if (faceMeshRef.current) return true;
    
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
      return !!faceMeshRef.current;
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

      // Load FaceMesh model (same as useCameraProctor.ts)
      const faceLandmarksDetection = await import("@tensorflow-models/face-landmarks-detection");
      faceMeshRef.current = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: "tfjs",
          refineLandmarks: true,
          maxFaces: 5, // Detect up to 5 faces
        }
      );
      
      console.log("[FaceDetection] FaceMesh model loaded successfully");
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
        if (!faceMeshRef.current) {
          const loaded = await loadModel();
          if (!loaded || !faceMeshRef.current) {
            return {
              faceCount: 0,
              status: "no_face",
              confidence: 0,
              message: "Face detection model not available",
              isValid: false,
            };
          }
        }

        // Run FaceMesh detection
        const predictions = await faceMeshRef.current.estimateFaces(source);
        
        const faceCount = predictions.length;

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

        // Single face detected - get bounding box from keypoints
        const face = predictions[0];
        const keypoints = face.keypoints;
        
        if (!keypoints || keypoints.length < 100) {
          return {
            faceCount: 0,
            status: "no_face",
            confidence: 0,
            message: "Face not detected properly. Please look at the camera.",
            isValid: false,
          };
        }

        // Calculate bounding box from keypoints
        const xs = keypoints.map((kp: any) => kp.x);
        const ys = keypoints.map((kp: any) => kp.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const boundingBox = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };

        // Check if face is large enough (at least 60x60 pixels)
        if (boundingBox.width < 60 || boundingBox.height < 60) {
          return {
            faceCount: 1,
            status: "no_face",
            confidence: 0.5,
            boundingBox,
            message: "Face too small. Please move closer to the camera.",
            isValid: false,
          };
        }

        // Check if face is centered reasonably (within middle 80% of frame)
        const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
        const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
        
        const faceCenterX = minX + boundingBox.width / 2;
        const faceCenterY = minY + boundingBox.height / 2;
        
        const marginX = sourceWidth * 0.1;
        const marginY = sourceHeight * 0.1;
        
        if (faceCenterX < marginX || faceCenterX > sourceWidth - marginX ||
            faceCenterY < marginY || faceCenterY > sourceHeight - marginY) {
          return {
            faceCount: 1,
            status: "no_face",
            confidence: 0.7,
            boundingBox,
            message: "Please center your face in the frame.",
            isValid: false,
          };
        }

        return {
          faceCount: 1,
          status: "single_face",
          confidence: 0.95,
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
