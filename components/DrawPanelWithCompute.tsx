import React, { useEffect, useRef, useState } from 'react';
import ComputeButton from './ComputeButton';

interface DrawPanelWithComputeProps {
  points: { x: number, y: number }[];
}

interface Point {
  x: number;
  y: number;
}
interface ConcavePoints {
  concavePoints: Point[];
}
interface ConcaveSet {
  points: Point[];
}

interface Rectangle {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points }) => {
  const [isComputed, setIsComputed] = useState(false);
  const [STPoints, setSTPoints] = useState<{ x: number, y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  console.log('points', points);

  const calculateRectangle = (points: { x: number, y: number }[]): Rectangle => {
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

  const calculateConcave = (rectangle: Rectangle, points: Point[]): ConcaveSet[] => {
    const concaveIndices: number[] = [];
    let firstIndexAdded = false;
  
    // pointsの要素を順に探索し、もしそれがRectangleの辺上に含まれる場合、そのインデックスをconcaveIndicesに格納する
    points.forEach((point, index) => {
      const isOnEdge = 
        (point.y === rectangle.topLeft.y) || // 上辺
        (point.y === rectangle.bottomLeft.y) || // 下辺
        (point.x === rectangle.topLeft.x) || // 左辺
        (point.x === rectangle.topRight.x); // 右辺
  
      if (!isOnEdge) {
        concaveIndices.push(index);
  
        // 最初の点のインデックスが追加された場合の処理
        if (index === 0) {
          firstIndexAdded = true;
        }
      }
    });
  
    // 連番が同じグループに入るようにグループ分け
    const groupedIndices: number[][] = [];
    let currentGroup: number[] = [];
  
    concaveIndices.forEach((index) => {
      if (currentGroup.length === 0 || index === currentGroup[currentGroup.length - 1] + 1) {
        currentGroup.push(index);
      } else {
        groupedIndices.push(currentGroup);
        currentGroup = [index];
      }
    });
  
    // 最後のグループを追加
    if (currentGroup.length > 0) {
      groupedIndices.push(currentGroup);
    }
  
    // 各グループに対して、前後のインデックスを追加する
    groupedIndices.forEach((group) => {
      if (group[0] > 0) {
        group.unshift(group[0] - 1);
      }
      if (group[group.length - 1] < points.length - 1) {
        group.push(group[group.length - 1] + 1);
      }
    });

    // 最初のインデックスが追加されている場合、最初と最後のグループを結合する
    if (firstIndexAdded && groupedIndices.length > 1) {
      const firstGroup = groupedIndices[0];
      const lastGroup = groupedIndices[groupedIndices.length - 1];

      // lastGroupの最後の1つの点を削除
      const modifiedLastGroup = lastGroup.slice(0, -1);

      // グループを接合
      const combinedGroup = [...modifiedLastGroup, ...firstGroup];
      
      // 最初と最後のグループを結合して、groupedIndicesの最初の位置に格納し、最後のグループを削除
      groupedIndices[0] = combinedGroup;
      groupedIndices.pop();
    }

  
    // グループ分けされたインデックスに対応するPointsの点を、グループの構造を保ったまま抽出
    const concaveSets: ConcaveSet[] = groupedIndices.map((group) => ({
      points: group.map(index => points[index])
    }));
  
    return concaveSets;
  };
  
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && isComputed) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
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
        console.log('長方形', rectangle);

        const concave = calculateConcave(rectangle, points)
        console.log('凹集合', concave);

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