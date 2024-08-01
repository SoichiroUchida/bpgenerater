import React, { useRef, useEffect, useState } from 'react';
import ComputeButton from './ComputeButton';

interface DrawPanelWithComputeProps {
  points: { x: number, y: number }[];
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygon, setPolygon] = useState<{ x: number, y: number }[]>([]);

  const gridSize = 20;

  const drawGrid = (context: CanvasRenderingContext2D) => {
    context.beginPath();
    for (let x = 0; x < context.canvas.width; x += gridSize) {
      context.moveTo(x, 0);
      context.lineTo(x, context.canvas.height);
    }
    for (let y = 0; y < context.canvas.height; y += gridSize) {
      context.moveTo(0, y);
      context.lineTo(context.canvas.width, y);
    }
    context.strokeStyle = '#ddd';
    context.stroke();
  };

  const drawPolygon = (context: CanvasRenderingContext2D) => {
    if (polygon.length > 0) {
      context.beginPath();
      context.moveTo(polygon[0].x, polygon[0].y);
      polygon.forEach((point) => {
        context.lineTo(point.x, point.y);
      });
      context.closePath();
      context.fillStyle = 'rgba(0, 0, 255, 0.3)';
      context.fill();
      context.strokeStyle = 'blue';
      context.lineWidth = 2;
      context.stroke();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid(context);
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        clearCanvas();
        drawPolygon(context);
      }
    }
  }, [polygon]);

  const handleCompute = () => {
    if (points.length < 3) {
      alert('少なくとも3点が必要です');
      return;
    }
    setPolygon([]); // 前回の計算結果を消す
    setTimeout(() => setPolygon(points), 0); // 新しい計算結果を設定
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div>
        <canvas ref={canvasRef} width={533} height={533} style={{ border: '1px solid #000' }} />
        <ComputeButton onClick={handleCompute} />
      </div>
    </div>
  );
};

export default DrawPanelWithCompute;
