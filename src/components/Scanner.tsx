'use client';

import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

interface Props {
  onResult: (text: string) => void;
  /** Keeps scanning after a hit, for staff scanning a line of passes. */
  continuous?: boolean;
}

export function Scanner({ onResult, continuous }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState('');
  const handler = useRef(onResult);
  handler.current = onResult;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer = 0;
    let stopped = false;
    let last = '';
    let lastAt = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const scan = () => {
      const v = video.current;
      if (stopped || !v) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = v.videoWidth * scale;
        canvas.height = v.videoHeight * scale;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
        if (code?.data && (code.data !== last || Date.now() - lastAt > 3000)) {
          last = code.data; lastAt = Date.now();
          navigator.vibrate?.(60);
          handler.current(code.data);
          if (!continuous) return;
        }
      }
      timer = window.setTimeout(scan, 140);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        scan();
      } catch (e) {
        setProblem((e as Error).name === 'NotAllowedError'
          ? 'Camera access is blocked. Allow it in your browser settings, or use your phone’s camera app to scan the code.'
          : 'No camera available here. Use your phone’s camera app to scan the code, or paste the link below.');
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [continuous]);

  return (
    <div className="scanner">
      <video ref={video} muted playsInline aria-label="Camera view" />
      <div className="scanner-frame" aria-hidden="true"><i /><i /><i /><i /><b /></div>
      {problem && <div className="scanner-problem">{problem}</div>}
    </div>
  );
}
