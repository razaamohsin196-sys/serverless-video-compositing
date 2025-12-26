import { useEffect, useRef, useState } from 'react';
import type { Corners, Point } from '../lib/types';

type PreviewPanelProps = {
  backgroundUrl: string;
  videoUrl: string;
  corners: Corners | null;
};

const drawTriangle = (
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point
) => {
  const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (denom === 0) return;

  const a =
    (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) /
    denom;
  const b =
    (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) /
    denom;
  const c =
    (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) /
    denom;
  const d =
    (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) /
    denom;
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    denom;
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    denom;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
  ctx.restore();
};

export const PreviewPanel = ({
  backgroundUrl,
  videoUrl,
  corners,
}: PreviewPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!backgroundUrl) return;
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = backgroundUrl;
  }, [backgroundUrl]);

  useEffect(() => {
    if (!videoUrl) return;
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.play().catch(() => undefined);
    videoRef.current = video;
    return () => {
      video.pause();
      videoRef.current = null;
    };
  }, [videoUrl]);

  useEffect(() => {
    if (!image || !corners || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);

      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        const [tl, tr, bl, br] = corners;
        const srcTL = { x: 0, y: 0 };
        const srcTR = { x: video.videoWidth, y: 0 };
        const srcBL = { x: 0, y: video.videoHeight };
        const srcBR = { x: video.videoWidth, y: video.videoHeight };

        drawTriangle(ctx, video, srcTL, srcTR, srcBR, tl, tr, br);
        drawTriangle(ctx, video, srcTL, srcBR, srcBL, tl, br, bl);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [image, corners]);

  return (
    <section className="panel">
      <h2>3) Preview composite</h2>
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} />
      </div>
      <p className="hint">
        The preview uses a two-triangle affine warp for a directionally accurate
        mock.
      </p>
    </section>
  );
};
