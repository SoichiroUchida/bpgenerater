import React, { useEffect, useRef, useState } from 'react';
import ComputeButton from './ComputeButton';

interface DrawPanelWithComputeProps {
  points: { x: number, y: number }[];
}

interface Point {
  x: number;
  y: number;
}
interface Concave {
  concavePoints: Point[];
}
interface Rectangle {
  topLeft: { x: number, y: number };
  topRight: { x: number, y: number };
  bottomRight: { x: number, y: number };
  bottomLeft: { x: number, y: number };
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points }) => {
  const [isComputed, setIsComputed] = useState(false);
  const [STPoints, setSTPoints] = useState<{ x: number, y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  console.log('points', points);

  const calculateRectangle = (points: { x: number, y: number }[]): Rectangle => { 
    // 配列pointsからx座標を取り出しxValues配列として格納する。
    const xValues = points.map(point => point.x);
    const yValues = points.map(point => point.y);

    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    
    return {
      topLeft: { x: xMin, y: yMax },
      topRight: { x: xMax, y: yMax },
      bottomRight: { x: xMax, y: yMin },
      bottomLeft: { x: xMin, y: yMin },
    };
  };

  const calculateConcave = (rectangle: Rectangle, points: Point[]): Concave => {
    const concave: Point[] = [];
  
    points.forEach((point) => {
      // 辺上にあるかを判定するフラグ
      let isOnEdge = false;
  
      // 長方形の上辺または下辺上にあるかをチェック
      if (
        (point.y === rectangle.topLeft.y || point.y === rectangle.bottomLeft.y)
      ) {
        isOnEdge = true;
      }
      if (
        (point.x === rectangle.topLeft.x || point.x === rectangle.topRight.x) 
      ) {
        isOnEdge = true;
      }
  
      // 辺上にない場合、concaveに追加
      if (!isOnEdge) {
        concave.push(point);
      }
    });
  
    // concave配列を含むConcaveオブジェクトを返す
    return { concavePoints: concave };
  };
  

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && isComputed) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        // 必要に応じてここに描画コードを追加
      }
    }
  }, [STPoints, isComputed]);

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
        const rectangle = calculateRectangle(points);
        console.log('長方形', rectangle)

        const concave = calculateConcave(rectangle, points);
        console.log('凹部分', concave)

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
