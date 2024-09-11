import React, { useEffect, useRef, useState } from 'react';
import ComputeButton from './ComputeButton';

interface DrawPanelWithComputeProps {
  points: { x: number, y: number }[];
}

interface Point {
  x: number;
  y: number;
}

interface ConcaveSet {
  points: Point[];
}

interface Rectangle {
  vertex1: Point;
  vertex2: Point;
  vertex3: Point;
  vertex4: Point;
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points }) => {
  const [isComputed, setIsComputed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 長方形を計算する
  const calculateRectangle = (points: Point[]): Rectangle => {
    const xValues = points.map(point => point.x);
    const yValues = points.map(point => point.y);

    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    return {
      vertex1: { x: xMin, y: yMax },
      vertex2: { x: xMax, y: yMax },
      vertex3: { x: xMax, y: yMin },
      vertex4: { x: xMin, y: yMin },
    };
  };

  // 点の最小最大値を計算する
  const findMinMaxXY = (points: Point[]) => {
    return points.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y),
      }),
      { minX: points[0].x, maxX: points[0].x, minY: points[0].y, maxY: points[0].y }
    );
  };

  // 凹み部分を計算する
  const calculateConcave = (rectangle: Rectangle, points: Point[]): ConcaveSet[] => {
    const concaveIndices: number[] = points
      .map((point, index) => {
        const isOnEdge = point.y === rectangle.vertex1.y || point.y === rectangle.vertex4.y || point.x === rectangle.vertex1.x || point.x === rectangle.vertex2.x;
        return isOnEdge ? null : index;
      })
      .filter(index => index !== null) as number[];

    const groupedIndices: number[][] = concaveIndices.reduce<number[][]>(
      (groups, index) => {
        if (!groups.length || index !== groups[groups.length - 1][groups[groups.length - 1].length - 1] + 1) {
          groups.push([index]);
        } else {
          groups[groups.length - 1].push(index);
        }
        return groups;
      },
      []
    );

    groupedIndices.forEach((group) => {
      if (group[0] > 0) group.unshift(group[0] - 1);
      if (group[group.length - 1] < points.length - 1) group.push(group[group.length - 1] + 1);
    });

    return groupedIndices.map(group => ({
      points: group.map(index => points[index]),
    }));
  };

  // 線分の交差チェック
  const doLinesIntersect1 = (mFP: Point, mLP: Point, start: Point, end: Point): boolean => {

    // ４点が同一直線上に存在するか判定
    const orientation = (p: Point, q: Point, r: Point) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    const onSameLine = orientation(mFP, mLP, start) === 0 && orientation(mFP, mLP, end) === 0 && orientation(start, end, mFP) === 0;

    const pointsEqual = (p1, p2) => p1.x === p2.x && p1.y === p2.y;

    const cross1 = (pointsEqual(mFP, start) && pointsEqual(mLP, end)) || (pointsEqual(mFP, end) && pointsEqual(mLP, start));


    const isBetween = (a: number, b: number, c: number) => (a < b && b < c) || (c < b && b < a);

    const cross2 = (
      (mFP.y === mLP.y) && (
        isBetween(start.x, mFP.x, end.x) ||
        isBetween(start.x, mLP.x, end.x) ||
        isBetween(mFP.x, start.x, mLP.x) ||
        isBetween(mLP.x, end.x, mFP.x)
      )) || (
      (mFP.x === mLP.x) && (
        isBetween(start.y, mFP.y, end.y) ||
        isBetween(start.y, mLP.y, end.y) ||
        isBetween(mFP.y, start.y, mLP.y) ||
        isBetween(mLP.y, end.y, mFP.y)
      ));

    return onSameLine && (cross1 || cross2);
  };

  // 幅のない線分の交差チェック
  const doLinesIntersect2 = (FP: Point, MFP: Point, start: Point, end: Point): boolean => {
    
    const isBetween = (a: number, b: number, c: number) => (a < b && b < c) || (c < b && b < a);

    if (start.x === end.x) {
      return (isBetween(FP.x, start.x, MFP.x) && isBetween(start.y, FP.y, end.y));
    } else {
      return (isBetween(FP.y, start.y, MFP.y) && isBetween(start.x, FP.x, end.x));
    }
  };

  // 内接四角形の計算
  const calculateCoveringRectangle = (concaveSets: ConcaveSet[]): Rectangle[] => {
    const rectangles: Rectangle[] = [];

    const createRectangle = (firstPoint: Point, movedFirstPoint: Point, lastPoint: Point, movedLastPoint: Point) => {
      return {
        vertex1: firstPoint,
        vertex2: movedFirstPoint,
        vertex3: movedLastPoint,
        vertex4: lastPoint
      };
    };

    concaveSets.forEach((set) => {
      const firstPoint = set.points[0];
      const lastPoint = set.points[set.points.length - 1];

      console.log('firstPoint:', firstPoint);
      console.log('lastPoint:', lastPoint);

      let shiftX = 0;
        let shiftY = 0;
        let scale = 20;

        const adjacentPoint = set.points[1];

        // 進行方向の計算
        if (firstPoint.y === adjacentPoint.y) 
          shiftX = firstPoint.x < adjacentPoint.x ? scale : -1 * scale;
        else shiftY = firstPoint.y < adjacentPoint.y ? scale : -1 * scale;

      //　入口平行型の凹みに対するアルゴリズム
      if (firstPoint.x === lastPoint.x || firstPoint.y === lastPoint.y) {
       
        // 最初と最後の点が一致する場合
        if (firstPoint.x === lastPoint.x && firstPoint.y === lastPoint.y) {

          const { minX, maxX, minY, maxY } = findMinMaxXY(set.points);
          const movedFirstPoint: Point = 
            (shiftX > 0) ? {x: maxX, y: firstPoint.y}
          : (shiftX < 0) ? {x: minX, y: firstPoint.y}
          : (shiftY > 0) ? {x: firstPoint.x, y: maxY}
          : {x: firstPoint.x, y: minY};

          let intersectionFound = true;
          let tempMovedFirstPoint = { ...movedFirstPoint };

          // 交差が解消されるまで続ける
          let maxIterations = 10;
          let iterationCount = 0;
          while (intersectionFound) {
            iterationCount++;

            if (iterationCount > maxIterations) {
              console.error("エラー: (一致型）反復回数が多すぎます。");
              break;
            }

            for (let i = 0; i < points.length; i++) {
              const start = points[i];
              const end = points[(i + 1) % points.length];

              if (!doLinesIntersect2(firstPoint, tempMovedFirstPoint, start, end)) {
                intersectionFound = false;
                break;
              }
            }

            // 交差が見つかった場合値を更新
            if (intersectionFound) {
              tempMovedFirstPoint = {
                x: tempMovedFirstPoint.x - shiftX,
                y: tempMovedFirstPoint.y - shiftY,
              };
            }
          }
          rectangles.push(createRectangle(firstPoint, tempMovedFirstPoint, tempMovedFirstPoint, firstPoint));

          // 最初と最後が一致しない場合
        } else {
          const movedFirstPoint: Point = {x: firstPoint.x + shiftX, y: firstPoint.y + shiftY};
          const movedLastPoint: Point = {x: lastPoint.x + shiftX, y: lastPoint.y + shiftY};

          let intersectionFound = false;
          let tempMovedFirstPoint = { ...movedFirstPoint };
          let tempMovedLastPoint = { ... movedLastPoint };

          let maxIterations = 10;
          let iterationCount = 0;
          while (!intersectionFound) {
            iterationCount++;

            if (iterationCount > maxIterations) {
              console.error("エラー: （非一致型）反復回数が多すぎます。");
              break;
            }

            console.log(`Iteration ${iterationCount}, checking intersections...`);
            
            for (let i = 0; i < points.length; i++) {
              const start = points[i];
              const end = points[(i + 1) % points.length];

              if (doLinesIntersect1(tempMovedLastPoint,tempMovedFirstPoint, start, end)) {
                intersectionFound = true;
                break;
              }
            }

            // 交差が見つかっていない場合は、tempMovedFirstPoint を更新するロジックが必要です
            if (!intersectionFound) {
              tempMovedFirstPoint = {
                x: tempMovedFirstPoint.x + shiftX,
                y: tempMovedFirstPoint.y + shiftY,
              };
              tempMovedLastPoint = {
                x: tempMovedLastPoint.x + shiftX,
                y: tempMovedLastPoint.y + shiftY,
              };
            }
          }
          rectangles.push(createRectangle(firstPoint, tempMovedFirstPoint, tempMovedLastPoint, lastPoint));
        }
      } else {
        // 入口非平行型
        const movedFirstPoint: Point = {x: firstPoint.x, y: firstPoint.y};
        const movedLastPoint: Point = {x: lastPoint.x, y: lastPoint.y};

        if (shiftX == 0) {
          movedLastPoint.y = firstPoint.y;
        } else {
          movedLastPoint.x = firstPoint.x;
        };

        let intersectionFound = false;
        let tempMovedFirstPoint = { ...movedFirstPoint };
        let tempMovedLastPoint = { ... movedLastPoint };

        let maxIterations = 10;
        let iterationCount = 0;
        while (!intersectionFound) {
          iterationCount++;

          if (iterationCount > maxIterations) {
            console.error("エラー: （非平行型）反復回数が多すぎます。");
            break;
          }

          console.log(`Iteration ${iterationCount}, checking intersections...`);
          
          for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];

            if (doLinesIntersect1(tempMovedLastPoint,tempMovedFirstPoint, start, end)) {
              intersectionFound = true;
              break;
            }
          }

          // 交差が見つかっていない場合は、tempMovedFirstPoint を更新するロジックが必要です
          if (!intersectionFound) {
            tempMovedFirstPoint = {
              x: tempMovedFirstPoint.x + shiftX,
              y: tempMovedFirstPoint.y + shiftY,
            };
            tempMovedLastPoint = {
              x: tempMovedLastPoint.x + shiftX,
              y: tempMovedLastPoint.y + shiftY,
            };
          }
        }
        rectangles.push(createRectangle(firstPoint, tempMovedFirstPoint, movedLastPoint, tempMovedLastPoint));
      }
    });
    return rectangles;
  };

  const handleCompute = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        const rectangle = calculateRectangle(points);
        const concave = calculateConcave(rectangle, points);
        const covering = calculateCoveringRectangle(concave);

        console.log('凹み長方形', covering);

        setIsComputed(true);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center'}}>
        <ComputeButton onClick={handleCompute} />
      </div>
      <canvas ref={canvasRef} width={533} height={533} style={{ border: '1px solid #000' }} />
    </div>
  );
};

export default DrawPanelWithCompute;