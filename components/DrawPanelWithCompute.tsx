import React, { useEffect, useRef, useState } from 'react';
import ComputeButton from './ComputeButton';

interface DrawPanelWithComputeProps {
  points: { x: number, y: number }[];
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points }) => {
  const [isComputed, setIsComputed] = useState(false);
  const [STPoints, setSTPoints] = useState<{ x: number, y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawRectangle = (
    context: CanvasRenderingContext2D,
    { x1, x2, y1, y2 }: { x1: number, x2: number, y1: number, y2: number }
  ) => {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y1);
    context.lineTo(x2, y2);
    context.lineTo(x1, y2);
    context.closePath();
    context.strokeStyle = 'blue';
    context.lineWidth = 2;
    context.stroke();
  };

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

  const ComputeSTDifference = (context: CanvasRenderingContext2D, boundingBox: { x1: number, x2: number, y1: number, y2: number }, points: { x: number, y: number }[]) => {
    // まず、S全体を描画します（背景として）
    context.fillStyle = 'lightgray';
    context.fillRect(boundingBox.x1, boundingBox.y1, boundingBox.x2 - boundingBox.x1, boundingBox.y2 - boundingBox.y1);

    // 次に、T（点列）を描画してその部分をクリアします
    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.closePath();
    context.fillStyle = 'white';
    context.fill();
    context.globalCompositeOperation = 'source-over';
  };

  "hullPoints または isComputed の値が変更されたときに、この useEffect が実行され、キャンパス上の描画を更新する。"
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && isComputed) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        drawPointsAndLines(context, STPoints);
      }
    }
  }, [STPoints, isComputed]);

  "SVGのダウンロードのメソッド"
  const handleDownload = () => {
    const fileName = prompt("ファイル名を入力してください", "drawing.svg");
    if (!fileName) return;

    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" width="533" height="533" viewBox="0 0 533 533">
        <g fill="none" stroke="black" stroke-width="2">
          ${STPoints.map((point, index) => {
            const nextPoint = STPoints[index + 1] || STPoints[0];
            return `<line x1="${point.x}" y1="${point.y}" x2="${nextPoint.x}" y2="${nextPoint.y}" />`;
          }).join('')}
          ${STPoints.map(point => `
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
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        const xValues = points.map(point => point.x);
        const yValues = points.map(point => point.y);
        const boundingBox = {
          x1: Math.min(...xValues),
          x2: Math.max(...xValues),
          y1: Math.min(...yValues),
          y2: Math.max(...yValues)
        };

        ComputeSTDifference(context, boundingBox, points);
        setIsComputed(true);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center'}}>
        <ComputeButton onClick={handleCompute} />
        <button onClick={handleDownload} style={{padding: '10px 20px', cursor: 'pointer' }}>
          ダウンロード
        </button>
      </div>
      <canvas ref={canvasRef} width={533} height={533} style={{ border: '1px solid #000' }} />
    </div>
  );
};

export default DrawPanelWithCompute;