import React, { useRef, useEffect, useState } from 'react';
import ClearButton from './ClearButton';

const DrawPanel: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<{ x: number, y: number }[]>([]);

  const gridSize = 20;

  const drawGrid = (context: CanvasRenderingContext2D) => {
    // グリッドを描画
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

  const drawPointsAndLines = (context: CanvasRenderingContext2D) => {
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
      context.arc(point.x, point.y, 2, 0, 2 * Math.PI);
    });
    context.strokeStyle = 'black';
    context.lineWidth = 2;
    context.stroke();
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
        drawPointsAndLines(context);
      }
    }
  }, [points]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // グリッドにスナップ
      const snappedX = Math.round(x / gridSize) * gridSize;
      const snappedY = Math.round(y / gridSize) * gridSize;

      setPoints([...points, { x: snappedX, y: snappedY }]);
    }
  };

  const handleClear = () => {
    setPoints([]);
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        clearCanvas();
      }
    }
  };

  return (
    <div>
      <canvas ref={canvasRef} width={800} height={800} style={{ border: '1px solid #000' }} onClick={handleCanvasClick} />
      <ClearButton onClick={handleClear} />
    </div>
  );
};

export default DrawPanel;
