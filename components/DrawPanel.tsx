import React, { useRef, useEffect, useState } from 'react';
import ClearButton from './ClearButton';
import UndoButton from './UndoButton';
import PolygonValidator from './PolygonValidator';

interface DrawPanelProps {
  onPointsChange: (points: { x: number, y: number }[]) => void;
}

const DrawPanel: React.FC<DrawPanelProps> = ({ onPointsChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<{ x: number, y: number }[]>([]);

  const gridSize = 20;

  const drawGrid = (context: CanvasRenderingContext2D) => {
    context.beginPath();
    for (let x = 0; x < context.canvas.width; x += gridSize) {
      context.moveTo(x, 0);
      context.lineTo(x, context.canvas.height);
    }
    for (let y = 0; y < context.canvas.height; y += gridSize) {
      context.moveTo(0, context.canvas.height - y);
      context.lineTo(context.canvas.width, context.canvas.height - y);
    }
    context.strokeStyle = '#ddd';
    context.stroke();
  };

  const drawPointsAndLines = (context: CanvasRenderingContext2D) => {
    context.beginPath();
    points.forEach((point, index) => {
      const adjustedY = context.canvas.height - point.y; // y座標を反転
      if (index === 0) {
        context.moveTo(point.x, adjustedY);
      } else {
        context.lineTo(point.x, adjustedY);
      }
      context.arc(point.x, adjustedY, 2, 0, 2 * Math.PI);
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

      let snappedX = Math.round(x / gridSize) * gridSize;
      let snappedY = Math.round((canvas.height - y) / gridSize) * gridSize; // y座標を反転してスナップ

      if (points.length > 0) {
        const lastPoint = points[points.length - 1];

        // 同じ点が連続して入力されるのを防ぐ
        if (snappedX === lastPoint.x && snappedY === lastPoint.y) {
          return;
        }

        if (points.length > 1) {
          const secondLastPoint = points[points.length - 2];

          const dx = lastPoint.x - secondLastPoint.x;
          const dy = lastPoint.y - secondLastPoint.y;

          // 直前の線分に直交する方向にスナップ
          if (Math.abs(dx) > Math.abs(dy)) {
            snappedX = lastPoint.x;
          } else {
            snappedY = lastPoint.y;
          }
        } else {
          const dx = Math.abs(snappedX - lastPoint.x);
          const dy = Math.abs(snappedY - lastPoint.y);

          if (dx > dy) {
            snappedY = lastPoint.y;
          } else {
            snappedX = lastPoint.x;
          }
        }
      }

      const newPoints = [...points, { x: snappedX, y: snappedY }];
      setPoints(newPoints);
      onPointsChange(newPoints);
    }
  };

  const handleClear = () => {
    setPoints([]);
    onPointsChange([]);
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        clearCanvas();
      }
    }
  };

  const handleUndo = () => {
    if (points.length === 0) return;
    const newPoints = points.slice(0, -1);
    setPoints(newPoints);
    onPointsChange(newPoints);
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        clearCanvas();
        drawPointsAndLines(context);
      }
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div>
        <div>
          <ClearButton onClick={handleClear} />
          <UndoButton onClick={handleUndo} />
          <canvas ref={canvasRef} width={533} height={533} style={{ border: '1px solid #000' }} onClick={handleCanvasClick} />
        </div>
      </div>
    </div>
  );
};

export default DrawPanel;
