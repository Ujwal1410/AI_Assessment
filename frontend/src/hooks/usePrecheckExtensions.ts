import { useState, useCallback, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

export type ExtensionCategory = 
  | "screen_recorder"
  | "automation"
  | "clipboard_manager"
  | "devtools"
  | "ad_blocker"
  | "unknown";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface DetectedExtension {
  id: string;
  category: ExtensionCategory;
  signature: string;
  confidence: ConfidenceLevel;
  description: string;
}

export interface ExtensionScanResult {
  extensions: DetectedExtension[];
  hasHighRisk: boolean;
  hasMediumRisk: boolean;
  scanTime: number;
}

interface UsePrecheckExtensionsReturn {
  isScanning: boolean;
  scanResult: ExtensionScanResult | null;
  error: string | null;
  scan: () => Promise<ExtensionScanResult>;
  reportWarning: (assessmentId: string, userId: string) => Promise<void>;
}

// ============================================================================
// Detection Signatures
// ============================================================================

interface GlobalVarSignature {
  name: string;
  category: ExtensionCategory;
  confidence: ConfidenceLevel;
  description: string;
}

const GLOBAL_VAR_SIGNATURES: GlobalVarSignature[] = [
  // Screen recorders
  { name: "__OBSPLUGIN__", category: "screen_recorder", confidence: "high", description: "OBS Browser Plugin" },
  { name: "ScreenRecorder", category: "screen_recorder", confidence: "high", description: "Screen Recorder Extension" },
  { name: "__screenCaptureEnabled__", category: "screen_recorder", confidence: "high", description: "Screen Capture API" },
  { name: "screencastify", category: "screen_recorder", confidence: "high", description: "Screencastify" },
  { name: "__loom__", category: "screen_recorder", confidence: "high", description: "Loom Screen Recorder" },
  
  // Clipboard managers
  { name: "_clipboardJS", category: "clipboard_manager", confidence: "medium", description: "Clipboard.js Extension" },
  { name: "__CLIP__", category: "clipboard_manager", confidence: "medium", description: "Clipboard Extension" },
  
  // DevTools
  { name: "__REACT_DEVTOOLS_GLOBAL_HOOK__", category: "devtools", confidence: "low", description: "React DevTools" },
  { name: "__VUE_DEVTOOLS_GLOBAL_HOOK__", category: "devtools", confidence: "low", description: "Vue DevTools" },
  { name: "__REDUX_DEVTOOLS_EXTENSION__", category: "devtools", confidence: "low", description: "Redux DevTools" },
  
  // Automation tools
  { name: "__selenium_unwrapped", category: "automation", confidence: "high", description: "Selenium WebDriver" },
  { name: "__webdriver_evaluate", category: "automation", confidence: "high", description: "WebDriver Automation" },
  { name: "__nightmare", category: "automation", confidence: "high", description: "Nightmare.js" },
  { name: "callPhantom", category: "automation", confidence: "high", description: "PhantomJS" },
  { name: "__puppeteer__", category: "automation", confidence: "high", description: "Puppeteer" },
];

interface DomSignature {
  selector: string;
  category: ExtensionCategory;
  confidence: ConfidenceLevel;
  description: string;
}

const DOM_SIGNATURES: DomSignature[] = [
  // Screen recorder overlays
  { selector: ".obs-control", category: "screen_recorder", confidence: "high", description: "OBS Control Overlay" },
  { selector: "#screencapture-overlay", category: "screen_recorder", confidence: "high", description: "Screen Capture Overlay" },
  { selector: "[data-screencastify]", category: "screen_recorder", confidence: "high", description: "Screencastify Element" },
  { selector: ".loom-container", category: "screen_recorder", confidence: "high", description: "Loom Container" },
  
  // Extension injected elements
  { selector: "[data-grammarly-shadow-root]", category: "unknown", confidence: "low", description: "Grammarly" },
  { selector: "#lastpass-icon", category: "unknown", confidence: "low", description: "LastPass" },
  
  // Automation markers
  { selector: "[webdriver]", category: "automation", confidence: "high", description: "WebDriver Attribute" },
];

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePrecheckExtensions(): UsePrecheckExtensionsReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ExtensionScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scanIdRef = useRef(0);

  // Detect global variables
  const detectGlobalVars = useCallback((): DetectedExtension[] => {
    const detected: DetectedExtension[] = [];
    
    if (typeof window === "undefined") return detected;
    
    for (const sig of GLOBAL_VAR_SIGNATURES) {
      try {
        // Check if the global variable exists
        if ((window as any)[sig.name] !== undefined) {
          detected.push({
            id: `global_${sig.name}`,
            category: sig.category,
            signature: `window.${sig.name}`,
            confidence: sig.confidence,
            description: sig.description,
          });
        }
      } catch (e) {
        // Some properties may throw on access
        continue;
      }
    }
    
    // Additional WebDriver detection
    try {
      if (navigator.webdriver === true) {
        detected.push({
          id: "navigator_webdriver",
          category: "automation",
          signature: "navigator.webdriver",
          confidence: "high",
          description: "Browser Automation Detected",
        });
      }
    } catch (e) {
      // Ignore
    }
    
    return detected;
  }, []);

  // Detect DOM signatures
  const detectDomSignatures = useCallback((): DetectedExtension[] => {
    const detected: DetectedExtension[] = [];
    
    if (typeof document === "undefined") return detected;
    
    for (const sig of DOM_SIGNATURES) {
      try {
        const element = document.querySelector(sig.selector);
        if (element) {
          detected.push({
            id: `dom_${sig.selector.replace(/[^a-zA-Z0-9]/g, "_")}`,
            category: sig.category,
            signature: sig.selector,
            confidence: sig.confidence,
            description: sig.description,
          });
        }
      } catch (e) {
        // Invalid selector or other error
        continue;
      }
    }
    
    return detected;
  }, []);

  // Detect ad blockers (multiple methods for better detection)
  const detectAdBlocker = useCallback(async (): Promise<DetectedExtension | null> => {
    if (typeof document === "undefined" || typeof window === "undefined") return null;
    
    // Method 1: Check for common ad blocker global variables
    const adBlockerGlobals = [
      "AdBlock",
      "adblock", 
      "__adblockplus__",
      "AdBlockPlus",
      "uBlock",
      "uBlockOrigin",
      "__ublock__",
    ];
    
    for (const global of adBlockerGlobals) {
      if ((window as any)[global]) {
        return {
          id: "adblocker_global",
          category: "ad_blocker",
          signature: `window.${global}`,
          confidence: "medium",
          description: "Ad Blocker Extension",
        };
      }
    }
    
    // Method 2: Bait element approach (more reliable with visible element)
    return new Promise((resolve) => {
      // Create multiple bait elements with different signatures
      const baits: HTMLElement[] = [];
      
      // Bait 1: Classic ad div
      const bait1 = document.createElement("div");
      bait1.className = "adsbox ad-banner ad-placeholder pub_300x250 textAd banner-ad";
      bait1.setAttribute("id", "ad-container-test");
      bait1.innerHTML = "&nbsp;";
      bait1.style.cssText = "position:fixed;top:-1000px;left:-1000px;width:300px;height:250px;background:#fff;";
      baits.push(bait1);
      
      // Bait 2: Google ad style
      const bait2 = document.createElement("ins");
      bait2.className = "adsbygoogle adsense ad-unit";
      bait2.style.cssText = "position:fixed;top:-1000px;left:-1000px;width:300px;height:250px;display:block;";
      baits.push(bait2);
      
      // Bait 3: Banner style
      const bait3 = document.createElement("div");
      bait3.className = "ad_banner ad-leaderboard sponsor-ad";
      bait3.setAttribute("data-ad-slot", "test");
      bait3.innerHTML = "<span>Advertisement</span>";
      bait3.style.cssText = "position:fixed;top:-1000px;left:-1000px;width:728px;height:90px;";
      baits.push(bait3);
      
      // Add all baits to body
      baits.forEach(b => document.body.appendChild(b));
      
      // Check after a delay (ad blockers need time to process)
      setTimeout(() => {
        let isBlocked = false;
        
        for (const bait of baits) {
          const styles = window.getComputedStyle(bait);
          const rect = bait.getBoundingClientRect();
          
          if (
            styles.display === "none" ||
            styles.visibility === "hidden" ||
            styles.opacity === "0" ||
            bait.offsetHeight === 0 ||
            bait.offsetWidth === 0 ||
            rect.height === 0 ||
            rect.width === 0 ||
            bait.offsetParent === null
          ) {
            isBlocked = true;
            break;
          }
        }
        
        // Clean up
        baits.forEach(bait => {
          if (bait.parentNode) {
            bait.parentNode.removeChild(bait);
          }
        });
        
        if (isBlocked) {
          resolve({
            id: "adblocker_detected",
            category: "ad_blocker",
            signature: "Ad element blocked/hidden",
            confidence: "medium",
            description: "Ad Blocker Extension",
          });
        } else {
          resolve(null);
        }
      }, 200); // Increased timeout for ad blocker to process
    });
  }, []);

  // Main scan function
  const scan = useCallback(async (): Promise<ExtensionScanResult> => {
    setIsScanning(true);
    setError(null);
    
    const currentScanId = ++scanIdRef.current;
    const startTime = performance.now();
    
    try {
      // Run all detections in parallel
      const [globalVars, domSignatures, adBlocker] = await Promise.all([
        Promise.resolve(detectGlobalVars()),
        Promise.resolve(detectDomSignatures()),
        detectAdBlocker(),
      ]);
      
      // Check if this scan is still current
      if (currentScanId !== scanIdRef.current) {
        throw new Error("Scan cancelled");
      }
      
      // Combine results and deduplicate
      const allExtensions = [...globalVars, ...domSignatures];
      if (adBlocker) {
        allExtensions.push(adBlocker);
      }
      
      // Deduplicate by id
      const uniqueExtensions = allExtensions.filter(
        (ext, index, self) => index === self.findIndex((e) => e.id === ext.id)
      );
      
      const scanTime = performance.now() - startTime;
      
      const result: ExtensionScanResult = {
        extensions: uniqueExtensions,
        hasHighRisk: uniqueExtensions.some(
          (e) => e.confidence === "high" && 
          (e.category === "screen_recorder" || e.category === "automation")
        ),
        hasMediumRisk: uniqueExtensions.some(
          (e) => e.confidence === "medium" || e.confidence === "high"
        ),
        scanTime,
      };
      
      setScanResult(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Scan failed";
      if (errorMessage !== "Scan cancelled") {
        setError(errorMessage);
      }
      throw err;
    } finally {
      if (currentScanId === scanIdRef.current) {
        setIsScanning(false);
      }
    }
  }, [detectGlobalVars, detectDomSignatures, detectAdBlocker]);

  // Report warning to backend
  const reportWarning = useCallback(async (assessmentId: string, userId: string): Promise<void> => {
    if (!scanResult || scanResult.extensions.length === 0) return;
    
    try {
      await fetch("/api/proctor/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "PRECHECK_WARNING",
          timestamp: new Date().toISOString(),
          assessmentId,
          userId,
          metadata: {
            source: "extension_detection",
            extensions: scanResult.extensions.map((e) => ({
              category: e.category,
              signature: e.signature,
              confidence: e.confidence,
            })),
            hasHighRisk: scanResult.hasHighRisk,
            hasMediumRisk: scanResult.hasMediumRisk,
          },
        }),
      });
    } catch (err) {
      console.error("[ExtensionDetection] Failed to report warning:", err);
    }
  }, [scanResult]);

  return {
    isScanning,
    scanResult,
    error,
    scan,
    reportWarning,
  };
}

export default usePrecheckExtensions;

