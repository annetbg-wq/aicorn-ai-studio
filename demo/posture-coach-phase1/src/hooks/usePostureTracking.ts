/**
 * usePostureTracking — Phase 2 React hook for AI Posture Coach.
 *
 * Manages camera lifecycle, periodic snapshot analysis, and session state.
 * Automatically falls back to Mock Mode if camera is unavailable.
 *
 * Anti-loop fix: interval callback is stored in a ref (not in effect deps),
 * so adding snapshots to state never re-creates the interval.
 *
 * @example
 *   const { isRunning, isMock, current, session, elapsed, start, stop } = usePostureTracking();
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { CameraService }           from '../services/cameraService';
import { PostureAnalysisService }  from '../services/postureAnalysisService';
import type { PostureResult }      from '../services/postureAnalysisService';
import { CONFIG }                  from '../config/external_services';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionSnapshot extends PostureResult {
  capturedAt: number;       // Date.now() timestamp
}

export interface SessionData {
  id:           string;
  startedAt:    Date;
  snapshots:    SessionSnapshot[];
  goodSeconds:  number;
  badSeconds:   number;
}

export interface TrackingState {
  isRunning:    boolean;
  isMock:       boolean;
  cameraActive: boolean;
  current:      SessionSnapshot | null;
  session:      SessionData    | null;
  elapsed:      number;                 // seconds since session start
  start:        () => Promise<void>;
  stop:         () => SessionData | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePostureTracking(): TrackingState {
  const [isRunning,    setIsRunning]    = useState(false);
  const [isMock,       setIsMock]       = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [current,      setCurrent]      = useState<SessionSnapshot | null>(null);
  const [session,      setSession]      = useState<SessionData     | null>(null);
  const [elapsed,      setElapsed]      = useState(0);

  // ── Refs — stable across renders, never trigger re-renders ────────────────
  const cameraRef    = useRef<CameraService | null>(null);
  const sessionRef   = useRef<SessionData   | null>(null); // mirror of session state
  const snapshotRef  = useRef<() => Promise<void>>(async () => {});
  const intervalId   = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerId      = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Single snapshot pass ──────────────────────────────────────────────────

  const doSnapshot = useCallback(async () => {
    const snap = sessionRef.current;
    if (!snap) return;

    let result: PostureResult;
    const frame = cameraRef.current?.isActive ? cameraRef.current.captureFrame() : null;

    if (frame) {
      result = await PostureAnalysisService.analyze(frame);
    } else {
      result = PostureAnalysisService.mockResult();
    }

    const entry: SessionSnapshot = { ...result, capturedAt: Date.now() };
    setCurrent(entry);

    const intervalSec = CONFIG.POSTURE.SNAPSHOT_INTERVAL_MS / 1000;

    // ← functional updater: no stale closure on `session`
    setSession(prev => {
      if (!prev) return prev;
      const updated: SessionData = {
        ...prev,
        snapshots:   [...prev.snapshots, entry],
        goodSeconds: result.score >= 60 ? prev.goodSeconds + intervalSec : prev.goodSeconds,
        badSeconds:  result.score  < 60 ? prev.badSeconds  + intervalSec : prev.badSeconds,
      };
      sessionRef.current = updated;   // keep ref in sync
      return updated;
    });

    // Browser notification for poor posture
    if (result.score < CONFIG.POSTURE.ALERT_SCORE_THRESHOLD) {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Posture Alert!', {
          body: result.issues.slice(0, 2).join(' · '),
          icon: '💪',
        });
      }
    }
  }, []); // no deps — stable forever; reads from refs only

  // store latest in ref so the interval closure always calls the current version
  snapshotRef.current = doSnapshot;

  // ── start ─────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    // Reset
    const newSession: SessionData = {
      id:          crypto.randomUUID(),
      startedAt:   new Date(),
      snapshots:   [],
      goodSeconds: 0,
      badSeconds:  0,
    };
    sessionRef.current = newSession;
    setSession(newSession);
    setCurrent(null);
    setElapsed(0);
    setIsRunning(true);

    // Request notification permission (non-blocking)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Camera — create fresh element each session
    const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    const cam   = new CameraService(video);
    cameraRef.current = cam;

    const camOk = await cam.start();
    if (camOk) {
      setCameraActive(true);
    } else {
      setIsMock(true);   // camera denied / unavailable → mock mode
    }

    // Immediate first check, then periodic
    await snapshotRef.current();
    intervalId.current = setInterval(() => snapshotRef.current(), CONFIG.POSTURE.SNAPSHOT_INTERVAL_MS);

    // Session timer
    timerId.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }, []);

  // ── stop ──────────────────────────────────────────────────────────────────

  const stop = useCallback((): SessionData | null => {
    setIsRunning(false);
    setCameraActive(false);

    cameraRef.current?.stop();
    cameraRef.current = null;

    if (intervalId.current) { clearInterval(intervalId.current); intervalId.current = null; }
    if (timerId.current)    { clearInterval(timerId.current);    timerId.current    = null; }

    return sessionRef.current;
  }, []);

  // ── cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cameraRef.current?.stop();
      if (intervalId.current) clearInterval(intervalId.current);
      if (timerId.current)    clearInterval(timerId.current);
    };
  }, []);

  return { isRunning, isMock, cameraActive, current, session, elapsed, start, stop };
}
