/**
 * @description Webcam capture service for AI Posture Coach.
 * Requests camera permission, streams live video to a <video> element,
 * and captures JPEG snapshots for Vision API analysis.
 *
 * Uses only browser-native APIs — no CDN dependency, no API key required.
 *
 * @example
 *   const cam = new CameraService(videoRef.current!);
 *   const granted = await cam.start();
 *   if (granted) {
 *     const frame = cam.captureFrame(); // base64 JPEG string
 *     cam.stop();
 *   }
 */

import { CONFIG } from '../config/external_services';

export class CameraService {
  private video:  HTMLVideoElement;
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement;
  private ctx:    CanvasRenderingContext2D;

  constructor(videoElement: HTMLVideoElement) {
    this.video  = videoElement;
    this.canvas = document.createElement('canvas');
    const ctx   = this.canvas.getContext('2d');
    if (!ctx) throw new Error('[CameraService] Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  // ── Camera lifecycle ──────────────────────────────────────────────────────

  /**
   * Request webcam access and start live stream to the video element.
   * Returns true if permission was granted, false if denied or unavailable.
   */
  async start(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('[CameraService] getUserMedia not supported in this browser');
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      return true;
    } catch (err: any) {
      const code = err?.name ?? 'Unknown';
      if (code === 'NotAllowedError') {
        console.warn('[CameraService] Camera permission denied by user');
      } else if (code === 'NotFoundError') {
        console.warn('[CameraService] No camera device found');
      } else {
        console.warn('[CameraService] getUserMedia error:', err);
      }
      return false;
    }
  }

  /** Stop all camera tracks and release the device. */
  stop(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream          = null;
    this.video.srcObject = null;
  }

  // ── Snapshot capture ──────────────────────────────────────────────────────

  /**
   * Capture the current video frame as a base64-encoded JPEG data URL.
   * Returns null if the camera is not active or video has no dimensions yet.
   */
  captureFrame(): string | null {
    try {
      const { videoWidth: w, videoHeight: h } = this.video;
      if (!w || !h) return null;

      this.canvas.width  = w;
      this.canvas.height = h;
      this.ctx.drawImage(this.video, 0, 0, w, h);

      return this.canvas.toDataURL('image/jpeg', CONFIG.POSTURE.IMAGE_QUALITY);
    } catch (err) {
      console.warn('[CameraService] captureFrame failed:', err);
      return null;
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  /** True if the camera is currently streaming. */
  get isActive(): boolean {
    return this.stream !== null && this.stream.active;
  }

  /** Current video resolution as { width, height }, or null if not streaming. */
  get resolution(): { width: number; height: number } | null {
    const { videoWidth: w, videoHeight: h } = this.video;
    return w && h ? { width: w, height: h } : null;
  }
}
