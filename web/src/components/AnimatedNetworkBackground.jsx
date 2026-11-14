import { useEffect, useRef } from 'react';

export default function AnimatedNetworkBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return undefined;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let nodes = [];
    let edges = [];
    let animationFrame = 0;

    const makeNetwork = () => {
      const amount = Math.max(14, Math.min(34, Math.round(width / 32)));
      nodes = Array.from({ length: amount }, (_, index) => ({
        x: 0.06 + Math.random() * 0.88,
        y: 0.08 + Math.random() * 0.84,
        phase: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        radius: 1.5 + Math.random() * 1.25,
        pulse: Math.random() * Math.PI * 2,
        index
      }));

      const connected = new Set();
      edges = [];
      nodes.forEach((node, index) => {
        const nearest = nodes.map((candidate, candidateIndex) => ({
          candidateIndex,
          distance: Math.hypot(node.x - candidate.x, node.y - candidate.y)
        })).filter(item => item.candidateIndex !== index).sort((a, b) => a.distance - b.distance).slice(0, 3);

        nearest.forEach(({ candidateIndex, distance }) => {
          const start = Math.min(index, candidateIndex);
          const end = Math.max(index, candidateIndex);
          const key = `${start}:${end}`;
          if (connected.has(key) || distance > 0.38) return;
          connected.add(key);
          edges.push({ start, end, phase: Math.random(), speed: 0.000045 + Math.random() * 0.000045, particle: edges.length % 3 === 0 });
        });
      });
    };

    const pointAt = (node, time) => ({
      x: (node.x + Math.sin(time * 0.00014 + node.phase) * 0.014) * width,
      y: (node.y + Math.sin(time * 0.00012 + node.phaseY) * 0.018) * height
    });

    const draw = time => {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      if (!width || !height) return;
      const points = nodes.map(node => pointAt(node, time));

      edges.forEach(edge => {
        const from = points[edge.start];
        const to = points[edge.end];
        const midpoint = (from.x + to.x) / 2;
        const textSide = midpoint < width * 0.52;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
          context.strokeStyle = textSide ? 'rgba(112, 153, 157, 0.10)' : 'rgba(125, 170, 169, 0.31)';
        context.lineWidth = 0.85;
        context.stroke();

        if (edge.particle) {
          const progress = (time * edge.speed + edge.phase) % 1;
          const x = from.x + (to.x - from.x) * progress;
          const y = from.y + (to.y - from.y) * progress;
          const tailProgress = Math.max(0, progress - 0.045);
          context.beginPath();
          context.moveTo(from.x + (to.x - from.x) * tailProgress, from.y + (to.y - from.y) * tailProgress);
          context.lineTo(x, y);
          context.strokeStyle = textSide ? 'rgba(166, 198, 194, 0.2)' : 'rgba(166, 206, 198, 0.62)';
          context.lineWidth = 1.25;
          context.stroke();
          context.beginPath();
          context.arc(x, y, 1.7, 0, Math.PI * 2);
          context.fillStyle = textSide ? 'rgba(166, 198, 194, 0.36)' : 'rgba(166, 218, 208, 0.92)';
          if (!textSide) { context.shadowBlur = 8; context.shadowColor = 'rgba(132, 190, 180, 0.38)'; }
          context.fill();
          context.shadowBlur = 0;
        }
      });

      nodes.forEach((node, index) => {
        const point = points[index];
        const pulse = (Math.sin(time * 0.00055 + node.pulse) + 1) / 2;
        const isAccent = node.index % 7 === 2;
        const isBlueAccent = node.index % 11 === 6;
        const textSide = point.x < width * 0.52;
        const alpha = textSide ? 0.2 + pulse * 0.12 : 0.52 + pulse * 0.23;
        if (isAccent) {
          context.beginPath();
          context.arc(point.x, point.y, 3.5 + pulse * 6, 0, Math.PI * 2);
          context.strokeStyle = `rgba(144, 194, 184, ${(textSide ? 0.025 : 0.055) + pulse * 0.055})`;
          context.lineWidth = 0.8;
          context.stroke();
        }
        context.beginPath();
        context.arc(point.x, point.y, node.radius + pulse * 0.25, 0, Math.PI * 2);
        context.fillStyle = isAccent ? `rgba(174, 215, 204, ${alpha})` : isBlueAccent ? `rgba(151, 188, 231, ${alpha * 0.9})` : `rgba(157, 190, 204, ${alpha * 0.86})`;
        if (isAccent && !textSide && pulse > 0.55) {
          context.shadowBlur = 9;
          context.shadowColor = 'rgba(127, 177, 168, 0.32)';
        }
        context.fill();
        context.shadowBlur = 0;
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      makeNetwork();
      draw(0);
    };

    const animate = time => {
      draw(time);
      if (!motionPreference.matches && !document.hidden) animationFrame = window.requestAnimationFrame(animate);
    };

    const start = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      if (motionPreference.matches || document.hidden) draw(0);
      else animationFrame = window.requestAnimationFrame(animate);
    };

    const onMotionPreferenceChange = () => start();
    const onVisibilityChange = () => start();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (resizeObserver) resizeObserver.observe(canvas);
    else window.addEventListener('resize', resize);
    motionPreference.addEventListener?.('change', onMotionPreferenceChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    resize();
    start();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      motionPreference.removeEventListener?.('change', onMotionPreferenceChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return <canvas className="network-motion-canvas" ref={canvasRef} aria-hidden="true"/>;
}
