import React, { useEffect, useRef } from 'react';
import ComputeButton from './ComputeButton';

interface DrawPanelWithComputeProps {
  points: { x: number, y: number }[];
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        drawPointsAndLines(context);
      }
    }
  }, [points]);

  const handleDownload = () => {
    const fileName = prompt("ファイル名を入力してください", "drawing.svg");
    if (!fileName) return;

    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" width="533" height="533" viewBox="0 0 533 533">
        <g fill="none" stroke="black" stroke-width="2">
          ${points.map((point, index) => {
            const nextPoint = points[index + 1];
            if (nextPoint) {
              return `<line x1="${point.x}" y1="${point.y}" x2="${nextPoint.x}" y2="${nextPoint.y}" />`;
            }
            return '';
          }).join('')}
          ${points.map(point => `
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <canvas ref={canvasRef} width={533} height={533} style={{ border: '1px solid #000' }} />
      <div style={{ marginTop: '10px' }}>
        <ComputeButton />
        <button onClick={handleDownload} style={{ marginLeft: '10px', padding: '10px 20px', cursor: 'pointer' }}>
          ダウンロード
        </button>
      </div>
    </div>
  );
};

export default DrawPanelWithCompute;
