import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Corners, Point } from '../lib/types';

type CornerEditorProps = {
  backgroundUrl: string;
  corners: Corners | null;
  onChange: (corners: Corners, size: { width: number; height: number }) => void;
};

const HANDLE_RADIUS = 12;

const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const CornerEditor = ({
  backgroundUrl,
  corners,
  onChange,
}: CornerEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!backgroundUrl) return;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      if (!corners) {
        const padX = width * 0.12;
        const padY = height * 0.12;
        const initial: Corners = [
          { x: padX, y: padY },
          { x: width - padX, y: padY },
          { x: padX, y: height - padY },
          { x: width - padX, y: height - padY },
        ];
        onChange(initial, { width, height });
      } else {
        onChange(corners, { width, height });
      }
    };
    img.src = backgroundUrl;
  }, [backgroundUrl]);

  useEffect(() => {
    if (!image || !corners || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);

    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.closePath();
    ctx.stroke();

    corners.forEach((corner, index) => {
      ctx.fillStyle = index === activeIndex ? '#ffcf33' : '#ffffff';
      ctx.strokeStyle = '#0b1f2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }, [image, corners, activeIndex]);

  const getPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    } as Point;
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!corners) return;
    const point = getPointer(event);
    if (!point) return;
    const index = corners.findIndex(
      (corner) => distance(corner, point) <= HANDLE_RADIUS * 1.6
    );
    if (index >= 0) {
      setActiveIndex(index);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!corners || activeIndex === null || !canvasRef.current) return;
    const point = getPointer(event);
    if (!point) return;
    const canvas = canvasRef.current;
    const next = corners.map((corner, index) =>
      index === activeIndex
        ? {
            x: Math.max(0, Math.min(canvas.width, point.x)),
            y: Math.max(0, Math.min(canvas.height, point.y)),
          }
        : corner
    ) as Corners;
    onChange(next, { width: canvas.width, height: canvas.height });
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activeIndex !== null) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setActiveIndex(null);
    }
  };

  return (
    <section className="panel">
      <h2>2) Place screen corners</h2>
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
      <p className="hint">
        Drag the four handles to match the screen corners. Order: TL, TR, BL, BR.
      </p>
    </section>
  );
};
