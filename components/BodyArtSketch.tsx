import React, { useEffect, useRef, useState } from 'react';
import { GestureMode, Spring } from '../types';

// Spring physics helper
const updateSpring = (spring: Spring) => {
  const force = spring.target - spring.val;
  spring.vel += force * spring.strength;
  spring.vel *= spring.drag;
  spring.val += spring.vel;
};

// Star Class for rhythm effect
class Star {
  x: number;
  y: number;
  rotation: number;
  birthTime: number;
  lifeSpan: number; // 5000 ms
  baseSize: number;
  p: any;

  constructor(p: any) {
    this.p = p;
    this.x = p.random(p.width);
    this.y = p.random(p.height);
    this.rotation = p.random(p.TWO_PI);
    this.birthTime = p.millis();
    this.lifeSpan = 5000;
    this.baseSize = p.random(60, 120);
  }

  isDead(): boolean {
    return this.p.millis() - this.birthTime > this.lifeSpan;
  }

  draw() {
    const age = this.p.millis() - this.birthTime;
    
    // Calculate scale: 
    // Rotate full size, then shrink in the last 1 second (1000ms)
    let currentScale = 1;
    const fadeOutDuration = 1000;
    
    if (age > this.lifeSpan - fadeOutDuration) {
       currentScale = this.p.map(age, this.lifeSpan - fadeOutDuration, this.lifeSpan, 1, 0);
    }
    
    // Constant rotation
    this.rotation += 0.03;

    this.p.push();
    this.p.translate(this.x, this.y);
    this.p.rotate(this.rotation);
    this.p.scale(currentScale);

    // Draw nested stars (White -> Black -> White -> Black)
    // 1. Outer White
    this.p.fill(255);
    this.p.noStroke();
    this.drawStarShape(0, 0, this.baseSize, this.baseSize * 0.5, 5);

    // 2. Middle Black
    this.p.fill(0);
    this.drawStarShape(0, 0, this.baseSize * 0.7, (this.baseSize * 0.5) * 0.7, 5);

    // 3. Inner White
    this.p.fill(255);
    this.drawStarShape(0, 0, this.baseSize * 0.45, (this.baseSize * 0.5) * 0.45, 5);

    // 4. Center Black
    this.p.fill(0);
    this.drawStarShape(0, 0, this.baseSize * 0.25, (this.baseSize * 0.5) * 0.25, 5);
    
    this.p.pop();
  }

  drawStarShape(x: number, y: number, radius1: number, radius2: number, npoints: number) {
    let angle = this.p.TWO_PI / npoints;
    let halfAngle = angle / 2.0;
    this.p.beginShape();
    // Start at -PI/2 to point upwards
    for (let a = -this.p.PI/2; a < this.p.TWO_PI - this.p.PI/2; a += angle) {
      let sx = x + this.p.cos(a) * radius1;
      let sy = y + this.p.sin(a) * radius1;
      this.p.vertex(sx, sy);
      sx = x + this.p.cos(a + halfAngle) * radius2;
      sy = y + this.p.sin(a + halfAngle) * radius2;
      this.p.vertex(sx, sy);
    }
    this.p.endShape(this.p.CLOSE);
  }
}

const BodyArtSketch: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // We use refs to store P5 and MediaPipe instances to access them inside closures/callbacks
  const p5InstanceRef = useRef<any>(null);
  const poseRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  // State for the visualization
  const segmentationResultRef = useRef<any>(null);
  const landmarksRef = useRef<any>(null);
  
  // Physics State
  const spreadXSpring = useRef<Spring>({ val: 0, target: 0, vel: 0, drag: 0.85, strength: 0.05 });
  const spreadYSpring = useRef<Spring>({ val: 0, target: 0, vel: 0, drag: 0.85, strength: 0.05 });

  useEffect(() => {
    // 1. Initialize P5 in Instance Mode
    const sketch = (p: any) => {
      let canvas: any;
      let buffer: any; // Graphic buffer for the segmentation mask
      let videoImg: any; // P5 image to hold video frame
      let mic: any;
      let fft: any;
      let peakDetect: any;
      let smoothedVol = 0; // Smooth the volume for animation
      let stars: Star[] = [];
      let lastBeatTime = 0;

      p.setup = () => {
        const container = containerRef.current;
        const w = container ? container.clientWidth : window.innerWidth;
        const h = container ? container.clientHeight : window.innerHeight;

        canvas = p.createCanvas(w, h);
        if (containerRef.current) {
          canvas.parent(containerRef.current);
        }
        
        p.pixelDensity(1);
        p.frameRate(30);
        
        // Setup graphics buffer for mask processing
        buffer = p.createGraphics(w, h);
        videoImg = p.createImage(w, h);

        // Initialize Audio Input safely
        try {
          if (p.AudioIn && p.FFT && p.PeakDetect) {
            mic = new p.AudioIn();
            mic.start();
            
            fft = new p.FFT();
            fft.setInput(mic);
            
            // Detect beats in low frequencies (20Hz - 200Hz) - standard for drums/bass
            peakDetect = new p.PeakDetect(20, 200, 0.15, 20);
          } else {
            console.warn("p5.sound not loaded or AudioIn unavailable");
          }
        } catch (e) {
          console.error("Audio init error:", e);
        }
      };

      p.windowResized = () => {
        const container = containerRef.current;
        if (container) {
            p.resizeCanvas(container.clientWidth, container.clientHeight);
            buffer.resizeCanvas(container.clientWidth, container.clientHeight);
            videoImg.resize(container.clientWidth, container.clientHeight);
        }
      };
      
      const resumeAudio = () => {
        if (p.userStartAudio) {
            p.userStartAudio().catch((e: any) => console.log("Audio resume error", e));
        }
      };

      p.mousePressed = resumeAudio;
      p.touchStarted = resumeAudio;

      p.draw = () => {
        p.background(0);

        // Update Physics
        updateSpring(spreadXSpring.current);
        updateSpring(spreadYSpring.current);

        // Analyze Gesture from latest landmarks
        analyzeGesture();
        
        // Audio Analysis
        let vol = 0;
        try {
          if (mic && mic.getLevel) {
              vol = mic.getLevel();
          }
          if (fft && peakDetect) {
             fft.analyze();
             peakDetect.update(fft);
             
             // Check for beat
             if (peakDetect.isDetected) {
                // Debounce to prevent too many stars at once (limit to ~5 per second max)
                if (p.millis() - lastBeatTime > 200) {
                    stars.push(new Star(p));
                    lastBeatTime = p.millis();
                }
             }
          }
        } catch (e) {
          // Ignore audio errors during draw to prevent crash
        }
        
        // Smooth the volume reading
        smoothedVol = p.lerp(smoothedVol, vol, 0.1);

        // If we have segmentation data
        if (segmentationResultRef.current && segmentationResultRef.current.segmentationMask) {
           drawComposition(p, buffer, videoImg, smoothedVol);
        } else {
            // Loading animation
            p.push();
            p.translate(p.width/2, p.height/2);
            p.stroke(255, 100);
            p.noFill();
            p.rotate(p.frameCount * 0.05);
            p.rectMode(p.CENTER);
            p.rect(0, 0, 50, 50);
            p.pop();
        }

        // Draw Stars (Overlay)
        // Filter out dead stars first
        stars = stars.filter(star => !star.isDead());
        stars.forEach(star => star.draw());
      };

      const analyzeGesture = () => {
        const lm = landmarksRef.current;
        if (!lm) return;

        // Landmarks indices (MediaPipe Pose):
        // 11: left_shoulder, 12: right_shoulder
        // 15: left_wrist, 16: right_wrist
        // 0: nose
        
        const nose = lm[0];
        const lShoulder = lm[11];
        const rShoulder = lm[12];
        const lWrist = lm[15];
        const rWrist = lm[16];

        if (!nose || !lShoulder || !rShoulder || !lWrist || !rWrist) return;

        // Calculate thresholds based on shoulder width (scale independent)
        const shoulderWidth = Math.abs(lShoulder.x - rShoulder.x);
        
        // 1. Check for Vertical (Arms Up)
        const isArmsUp = lWrist.y < nose.y && rWrist.y < nose.y;

        // 2. Check for Horizontal (Arms Spread)
        // Let's rely on simple distance checks relative to body center
        const centerX = (lShoulder.x + rShoulder.x) / 2;
        const leftDist = Math.abs(lWrist.x - centerX);
        const rightDist = Math.abs(rWrist.x - centerX);

        // Determine Mode
        let mode = GestureMode.NEUTRAL;

        if (lWrist.y < nose.y - 0.1 && rWrist.y < nose.y - 0.1) {
            mode = GestureMode.VERTICAL;
        } else if (leftDist > shoulderWidth * 1.5 && rightDist > shoulderWidth * 1.5 && Math.abs(lWrist.y - lShoulder.y) < 0.3) {
            mode = GestureMode.HORIZONTAL;
        }

        // Set physics targets based on mode
        const spreadAmount = 150; // pixels

        if (mode === GestureMode.HORIZONTAL) {
            spreadXSpring.current.target = spreadAmount;
            spreadYSpring.current.target = 0;
        } else if (mode === GestureMode.VERTICAL) {
            spreadXSpring.current.target = 0;
            spreadYSpring.current.target = spreadAmount;
        } else {
            spreadXSpring.current.target = 0;
            spreadYSpring.current.target = 0;
        }
      };

      const drawComposition = (p: any, buffer: any, vidImg: any, vol: number) => {
        // Draw mask to buffer
        buffer.clear();
        try {
          if (segmentationResultRef.current && segmentationResultRef.current.segmentationMask) {
             buffer.drawingContext.drawImage(
                segmentationResultRef.current.segmentationMask, 
                0, 0, buffer.width, buffer.height
             );
          }
        } catch (e) {
          return;
        }
        
        const layers = 6;
        const currentXSpread = spreadXSpring.current.val;
        const currentYSpread = spreadYSpring.current.val;
        
        // Audio reactive expansion
        // Vol is 0.0 to 1.0 (approx). 
        const musicBeat = vol * 200; 

        // 1. Draw Echo Layers (Background)
        p.push();
        p.imageMode(p.CENTER);
        
        // We draw pairs of echoes expanding outwards
        for (let i = layers; i > 0; i--) {
            // Calculate offsets
            // Normalized progress 0 to 1
            const progress = i / layers; 
            
            // X Offset expansion (Left and Right)
            const offX = currentXSpread * i * 0.8; 
            const offY = currentYSpread * i * 0.8;

            // Alternate colors: White and Grey for contrast on black background
            const isWhite = i % 2 === 0;
            p.tint(isWhite ? 255 : 80); 

            const centerX = p.width / 2;
            const centerY = p.height / 2;
            
            // Apply music beat to echo size slightly
            const w = p.width + (musicBeat * 0.5);
            const h = p.height + (musicBeat * 0.5);

            if (Math.abs(currentXSpread) > 1) {
                // Horizontal Spread
                 p.image(buffer, centerX - offX, centerY, w, h);
                 p.image(buffer, centerX + offX, centerY, w, h);
            } else if (Math.abs(currentYSpread) > 1) {
                // Vertical Spread
                p.image(buffer, centerX, centerY - offY, w, h);
                p.image(buffer, centerX, centerY + offY, w, h);
            } else {
                 // Nested / Neutral - slight oscillation for "alive" feel
                 const breath = Math.sin(p.frameCount * 0.05 + i) * 5;
                 p.image(buffer, centerX, centerY, w + breath + (i*10), h + breath + (i*10));
            }
        }
        p.pop();

        // 2. Draw Outline (Reactive Body Outline)
        // We draw this BEFORE the main body so it acts as a glow/outline behind it
        p.push();
        p.imageMode(p.CENTER);
        p.tint(255); // White outline
        
        // Scale based on volume
        // Base scale 1.0 + volume influence
        const outlineScale = 1.0 + (vol * 1.5); // Tune this multiplier for sensitivity
        
        const outlineW = p.width * outlineScale;
        const outlineH = p.height * outlineScale;
        
        p.image(buffer, p.width/2, p.height/2, outlineW, outlineH);
        p.pop();

        // 3. Draw Main Body (Foreground)
        p.push();
        // Update p5 image with video data
        if (videoRef.current && videoRef.current.readyState === 4) {
             vidImg.drawingContext.drawImage(videoRef.current, 0, 0, vidImg.width, vidImg.height);
             
             // Apply Grayscale to the source video image
             vidImg.filter(p.GRAY);
             
             // Apply mask
             vidImg.mask(buffer); // Buffer contains the white-on-transparent mask
             
             p.imageMode(p.CORNER); 
             p.image(vidImg, 0, 0, p.width, p.height);
        }
        p.pop();
      };
    };

    // Initialize P5
    if (window.p5) {
      p5InstanceRef.current = new window.p5(sketch);
    }

    return () => {
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
      }
    };
  }, []);

  // 2. Initialize MediaPipe Pose
  useEffect(() => {
    let isMounted = true;

    const initMediaPipe = async () => {
      try {
        if (!window.Pose || !window.Camera) {
             throw new Error("MediaPipe libraries not loaded via CDN properly.");
        }
        
        if (!isMounted) return;

        const pose = new window.Pose({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
          }
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: true, // CRITICAL: We need the mask
          smoothSegmentation: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults((results: any) => {
          if (!isMounted) return;
          setIsLoading(false);
          // Update Refs for P5 to consume
          segmentationResultRef.current = results;
          landmarksRef.current = results.poseLandmarks;
        });
        
        if (!isMounted) {
            pose.close();
            return;
        }

        poseRef.current = pose;

        // Setup Camera
        if (videoRef.current) {
          const camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (!isMounted) return;
              if (poseRef.current) {
                 try {
                   await poseRef.current.send({ image: videoRef.current });
                 } catch (e) {
                   console.error("Pose send error", e);
                 }
              }
            },
            width: 640,
            height: 480
          });
          camera.start();
          cameraRef.current = camera;
        }

      } catch (err: any) {
        if (isMounted) {
            console.error("MediaPipe Init Error:", err);
            setErrorMsg(err.message || "Failed to initialize camera or AI.");
            setIsLoading(false);
        }
      }
    };

    // Small timeout to ensure scripts injected in HTML are ready
    const timer = setTimeout(initMediaPipe, 1000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (cameraRef.current) cameraRef.current.stop();
      if (poseRef.current) poseRef.current.close();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-black">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white text-lg tracking-wider animate-pulse">Initializing Vision Systems...</p>
            <p className="text-gray-500 text-xs mt-2">Please allow camera and microphone access</p>
          </div>
        </div>
      )}
      {errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-50">
          <div className="text-white bg-white/10 p-6 rounded-lg border border-white/20 max-w-md text-center">
            <h3 className="font-bold text-lg mb-2">System Error</h3>
            <p>{errorMsg}</p>
          </div>
        </div>
      )}
      {/* Video element is required for MediaPipe but hidden visually, we draw it on Canvas */}
      <video 
        ref={videoRef} 
        className="hidden" 
        playsInline 
        muted
        style={{ transform: 'scaleX(-1)' }} // Mirror locally if debugging, but canvas handles drawing
      ></video>
    </div>
  );
};

export default BodyArtSketch;