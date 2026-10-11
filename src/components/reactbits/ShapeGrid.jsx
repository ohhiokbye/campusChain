// Square-only adaptation of React Bits ShapeGrid / David Haz.
// See THIRD_PARTY_NOTICES.md. Decorative canvas, with no booking logic.
import { useEffect, useRef } from 'react';

export default function ShapeGrid({
  borderColor = 'rgba(150, 140, 190, 0.12)',
  squareSize = 72,
}) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0,
      height = 0,
      offset = 0,
      frame = null,
      lastTime = null;
    let visible = false;
    function draw() {
      context.clearRect(0, 0, width, height);
      context.strokeStyle = borderColor;
      context.lineWidth = 1;
      context.beginPath();
      for (let x = -squareSize + offset; x < width; x += squareSize) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      for (let y = -squareSize + offset; y < height; y += squareSize) {
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.stroke();
    }
    function animate(time) {
      frame = null;
      if (lastTime !== null && time - lastTime < 33) {
        frame = requestAnimationFrame(animate);
        return;
      }
      const delta = lastTime === null ? 0 : Math.min(time - lastTime, 80);
      lastTime = time;
      offset = (offset + delta * 0.004) % squareSize;
      draw();
      frame = requestAnimationFrame(animate);
    }
    function update() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastTime = null;
      draw();
      if (visible && !document.hidden && !motion.matches)
        frame = requestAnimationFrame(animate);
    }
    function resize() {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      update();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    visibilityObserver.observe(canvas);
    document.addEventListener('visibilitychange', update);
    motion.addEventListener('change', update);
    resize();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', update);
      motion.removeEventListener('change', update);
    };
  }, [borderColor, squareSize]);
  return (
    <canvas ref={canvasRef} className="shapegrid-canvas" aria-hidden="true" />
  );
}
