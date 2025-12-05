// Adding global types for the CDN loaded scripts
declare global {
  interface Window {
    p5: any;
    Pose: any;
    Camera: any;
  }
}

export enum GestureMode {
  NEUTRAL = 'NEUTRAL',
  HORIZONTAL = 'HORIZONTAL',
  VERTICAL = 'VERTICAL'
}

export interface Spring {
  val: number;
  target: number;
  vel: number;
  drag: number;
  strength: number;
}