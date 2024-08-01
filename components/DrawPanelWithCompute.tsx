import React, { useEffect, useRef, useState } from 'react';
import ComputeButton from './ComputeButton';
import convexHull from 'convex-hull';

interface DrawPanelWithComputeProps {
  points: { x: number, y: number }[];
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points }) => {
  const [isComputed, setIsComputed] = useState(false);
  const [hullPoints, setHullPoints] = useState<{ x: number, y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawPointsAndLines = (context: CanvasRenderingContext2D, pointsToDraw: { x: number, y: number }[]) => {
    context.beginPath();
    pointsToDraw.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
      context.arc(point.x, point.y, 2, 0, 2 * Math.PI);
    });
    context.closePath();
    context.strokeStyle = 'black';
    context.lineWidth = 2;
    context.stroke();
  };

  const calculateConvexHull = () => {
    const formattedPoints = points.map(point => [point.x, point.y]);
    const hullIndices = convexHull(formattedPoints);
    const hull = hullIndices.map(([i]) => points[i]);
    setHullPoints(hull);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && isComputed) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        drawPointsAndLines(context, hullPoints);
      }
    }
  }, [hullPoints, isComputed]);

  const handleDownload = () => {
    const fileName = prompt("ファイル名を入力してください", "drawing.svg");
    if (!fileName) return;

    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" width="533" height="533" viewBox="0 0 533 533">
        <g fill="none" stroke="black" stroke-width="2">
          ${hullPoints.map((point, index) => {
            const nextPoint = hullPoints[index + 1] || hullPoints[0];
            return `<line x1="${point.x}" y1="${point.y}" x2="${nextPoint.x}" y2="${nextPoint.y}" />`;
          }).join('')}
          ${hullPoints.map(point => `
            <circle cx="${point.x}" cy="${point.y}" r="2" fill="black" />
          `).join('')}
        </g>
      </svg>
    `;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCompute = () => {
    calculateConvexHull();
    setIsComputed(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <canvas ref={canvasRef} width={533} height={533} style={{ border: '1px solid #000' }} />
      <div style={{ marginTop: '10px' }}>
        <ComputeButton onClick={handleCompute} />
        <button onClick={handleDownload} style={{ marginLeft: '10px', padding: '10px 20px', cursor: 'pointer' }}>
          ダウンロード
        </button>
      </div>
    </div>
  );
};

export default DrawPanelWithCompute;
