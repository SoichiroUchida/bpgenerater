import React, { useEffect, useRef, useState } from 'react';
import ComputeButton from './ComputeButton';
import { promises } from 'dns';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

interface DrawPanelWithComputeProps {
  points: { x: number; y: number }[];
}

interface Point {
  x: number;
  y: number;
}

interface TreeNode {
  rectangle: Point[];
  children: TreeNode[];
}

interface Shift {
  shiftX: number;
  shiftY: number;
}

interface ThreeParts {
  shift: Shift;
  leftPart: Point[];
  centerPart: Point[];
  rightPart: Point[];
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points: polygonPoints }) => {
  const [isComputed, setIsComputed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = 20;
  const epsilon = 1e-10;
  let maxIterations = 20;

  interface Point {
    x: number;
    y: number;
  }
  
  // 多角形の頂点が反時計回りかを判定する関数。
  function isClockwise(points: Point[]): boolean {
    let sum = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const current = points[i];
      const next = points[(i + 1) % n];
      sum += (next.x - current.x) * (next.y + current.y);
    }
    return sum > 0;
  }

  //　2点がなすベクトルの向きを計算する関数
  function getVectorDirection(p1: Point, p2: Point): {shiftX: number, shiftY: number} {
  let shiftX = 0;
  let shiftY = 0;

  // 進行方向の計算
  if (p1.y === p2.y)
    shiftX = p1.x < p2.x ? scale : -1 * scale;
  else shiftY = p1.y < p2.y ? scale : -1 * scale;

  return {shiftX, shiftY}

  }
  
  //　連続する同じ点を解消する関数
  function removeConsecutiveDuplicates(points: Point[]): Point[] {
    if (points.length === 0) return []; // 空配列の場合、すぐに返す

    const uniquePoints: Point[] = [points[0]]; // 最初の点を必ず追加

    for (let i = 1; i < points.length; i++) {
      const prevPoint = uniquePoints[uniquePoints.length - 1]; // 直前の点
      const currentPoint = points[i];

      // 直前の点と現在の点が異なる場合のみ追加
      if (prevPoint.x !== currentPoint.x || prevPoint.y !== currentPoint.y) {
        uniquePoints.push(currentPoint);
      }
    }

    return uniquePoints;
  }

  // 多角形の頂点を反時計回りにソートする関数。
  function ensureCounterClockwise(points: Point[]): Point[] {
    if (isClockwise(points)) {
      return points.slice().reverse(); // 頂点列を反転して反時計回りに
    } else {
      return points.slice(); // コピーを返して元の配列を変更しない
    }
  }

  // 点集合に含まれるx座標y座標の最小値と最大値を取得する
  const getMinMaxXY = (points: Point[]) => {
    return points.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y),
      }),
      {
        minX: points[0].x,
        maxX: points[0].x,
        minY: points[0].y,
        maxY: points[0].y,
      }
    );
  };

  // 点の集合に対し外接長方形を計算する
  const computeBoundingRectangle = (points: Point[]): Point[] => {
    const { minX, maxX, minY, maxY } = getMinMaxXY(points);

    const boundingRectangle = [
      { x: minX, y: maxY }, // 左上
      { x: maxX, y: maxY }, // 右上
      { x: maxX, y: minY }, // 右下
      { x: minX, y: minY }, // 左下
    ];

    return boundingRectangle;
  };

  // 線分上（両端を含む）に点が存在するか判定
  function isPointOnLineSegment(p: Point, a: Point, b: Point): boolean {
    const cross = (b.y - a.y) * (p.x - a.x) - (b.x - a.x) * (p.y - a.y);
    if (Math.abs(cross) > 1e-8) {
      return false;
    }

    const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    if (dot < 0) {
      return false;
    }

    const squaredLengthBA = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;

    if (squaredLengthBA === 0) {
      // 線分の長さがゼロの場合、点pが点aと同じかどうかを確認
      return p.x === a.x && p.y === a.y;
    }

    if (dot > squaredLengthBA) {
      return false;
    }

    return true;
  }

  // 点pが線分p_1→p_2の左側に存在するか判定する関数。
  // 正なら左側、０なら直線上、負なら右側に存在。
  function isLeft(p: Point, p0: Point, p1: Point): number {
    return (p1.x - p0.x) * (p.y - p0.y) - (p.x - p0.x) * (p1.y - p0.y);
  }

  // 隣接する同じ点を削除する関数
  function removeConsecutiveDuplicatePoints(points: Point[]): Point[] {
    if (points.length === 0) return [];

    const result: Point[] = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1];
      const currentPoint = points[i];

      const isSamePoint =
        Math.abs(prevPoint.x - currentPoint.x) < epsilon &&
        Math.abs(prevPoint.y - currentPoint.y) < epsilon;

      if (!isSamePoint) {
        result.push(currentPoint);
      }
    }

    return result;
  }

  //　巻き数法による、ある１点が多角形の内部に存在するかの判定。
  function isPointInsidePolygon(point: Point, polygon: Point[]): boolean {
    let windingNumber = 0;
  
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
  
      if (start.y <= point.y) {
        if (end.y > point.y && isLeft(start, end, point) > 0) {
          windingNumber++;
        }
      } else {
        if (end.y <= point.y && isLeft(start, end, point) < 0) {
          windingNumber--;
        }
      }
    }
  
    return windingNumber !== 0;
  }

  // ある１点が多角形の辺上に存在するか判定する関数
  function isPointPartialPolygon(point: Point, polygon: Point[]): boolean {
  
    // 多角形の各辺を順にチェック
    for (let i = 0; i < polygon.length - 1; i++) {
  
      // 点が辺上にあるかをチェック
      if (isPointOnLineSegment(point, polygon[i], polygon[(i + 1) % polygon.length] )) {
        return true; // 境界上にある場合は true
      }
    }

    return false;
  }

  // ある１点が多角形の内部または辺上に存在するか判定する関数。
  function isPointInsideOrPartialPolygon(point: Point, polygon: Point[]): boolean {
    return isPointInsidePolygon(point, polygon) || isPointPartialPolygon(point, polygon);
  }

  // 入力値の前処理
  function processPoints(points: Point[]): Point[] {
    const newPoints = points.slice(0, -1);
  
    if (newPoints.length === 0) {
      return [];
    }
  
    const maxX = Math.max(...newPoints.map(point => point.x));
  
    const maxXPoints = newPoints.filter(point => point.x === maxX);
    const maxPoint = maxXPoints.reduce((prev, current) => {
      return current.y > prev.y ? current : prev;
    });
  
    const index = newPoints.findIndex(
      point => point.x === maxPoint.x && point.y === maxPoint.y
    );

    const rotatedPoints = newPoints.slice(index).concat(newPoints.slice(0, index));
  
    return rotatedPoints;
  }

  // 凹み部分を計算する
  const getConcaveParts = (polygon: Point[]): Point[][] => {
    const boundingRectangle = computeBoundingRectangle(polygon);

    const concaveIndices: number[] = polygon
      .map((point, index) => {
        const isOnEdge =
          Math.abs(point.y - boundingRectangle[0].y) < epsilon ||
          Math.abs(point.y - boundingRectangle[2].y) < epsilon ||
          Math.abs(point.x - boundingRectangle[0].x) < epsilon ||
          Math.abs(point.x - boundingRectangle[2].x) < epsilon;
        return isOnEdge ? null : index;
      })
      .filter((index) => index !== null) as number[];

    const groupedIndices: number[][] = concaveIndices.reduce<number[][]>(
      (groups, index) => {
        if (
          !groups.length ||
          index !== groups[groups.length - 1][groups[groups.length - 1].length - 1] + 1
        ) {
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
      if (group[group.length - 1] < polygon.length - 1) group.push(group[group.length - 1] + 1);
    });

    return groupedIndices.map((group) => group.map((index) => polygon[index]));
  };

  // ある１点でポリゴンを２分割する関数
  // rightPart専用
  function splitLeftPolygonIntoTwo(polygonVertices: Point[], point: Point): [Point[], Point[]] {
    const n = polygonVertices.length;
  
    // isPointOnLineSegmentがtrueになる最大のインデックスを探す
    const index = polygonVertices.reduce((maxIndex, start, i) => {
      const end = polygonVertices[(i + 1) % n];
      return isPointOnLineSegment(point, start, end) ? i : maxIndex;
    }, -1);
  
    if (index === -1) {
      throw new Error('指定された点は多角形の外周上にありません。');
    }
  
    // 分割処理と重複点の削除
    const firstPolygon = removeConsecutiveDuplicates([
      ...polygonVertices.slice(0, index + 1),
      point,
    ]);
  
    const secondPolygon = removeConsecutiveDuplicates([
      point,
      ...polygonVertices.slice(index + 1),
    ]);
  
    return [firstPolygon, secondPolygon];
  }
  

  // ある１点でポリゴンを２分割する関数
  // rightPart専用
  function splitRightPolygonIntoTwo(polygonVertices: Point[], point: Point): [Point[], Point[]] {
    const n = polygonVertices.length;
  
    // 分割点が存在する辺を探す
    const index = polygonVertices.findIndex((start, i) => 
      isPointOnLineSegment(point, start, polygonVertices[(i + 1) % n])
    );
  
    if (index === -1) {
      throw new Error('指定された点は多角形の外周上にありません。');
    }
  
    // 分割処理と重複点の削除
    const firstPolygon = removeConsecutiveDuplicates([
      ...polygonVertices.slice(0, index + 1),
      point,
    ]);
  
    const secondPolygon = removeConsecutiveDuplicates([
      point,
      ...polygonVertices.slice(index + 1),
    ]);
  
    return [firstPolygon, secondPolygon];
  }
  

  // １つの凹みから３パーツを計算する関数。
  const concaveToThreeParts = (concavePoints: Point[]): ThreeParts => {
    const firstPoint = concavePoints[0];
    const nextPoint = concavePoints[1];
    const lastPoint = concavePoints[concavePoints.length - 1];

    const shiftDirection = getVectorDirection(firstPoint, nextPoint);
    const movedFirstPoint: Point = { x: firstPoint.x + shiftDirection.shiftX, y: firstPoint.y + shiftDirection.shiftY};
    const movedLastPoint: Point = { x: lastPoint.x + shiftDirection.shiftX, y: lastPoint.y + shiftDirection.shiftY };

    let tempMovedFirstPoint = { ...movedFirstPoint };

    while (isPointInsideOrPartialPolygon(tempMovedFirstPoint, concavePoints)) {
      tempMovedFirstPoint = {
        x: tempMovedFirstPoint.x + (0.5 * shiftDirection.shiftX),
        y: tempMovedFirstPoint.y + (0.5 * shiftDirection.shiftY),
      };
    }

    tempMovedFirstPoint = {
      x: tempMovedFirstPoint.x - (0.5 * shiftDirection.shiftX),
      y: tempMovedFirstPoint.y - (0.5 * shiftDirection.shiftY),
    };

    const leftAndCenterConcaves = splitRightPolygonIntoTwo(concavePoints, tempMovedFirstPoint)

    if(
        Math.abs(concavePoints[0].x - concavePoints[concavePoints.length - 1].x) < epsilon 
        || Math.abs(concavePoints[0].y - concavePoints[concavePoints.length - 1].y) < epsilon
      ) {

      let tempMovedLastPoint = { ...movedLastPoint };
      let iterations = 0

      while (isPointInsideOrPartialPolygon(tempMovedLastPoint, concavePoints)) {
        tempMovedLastPoint = {
          x: tempMovedLastPoint.x + (0.5 * shiftDirection.shiftX),
          y: tempMovedLastPoint.y + (0.5 * shiftDirection.shiftY),
          
        };

        iterations++;

        if (iterations > maxIterations) {
          throw new Error(
            `Exceeded maximum iterations (${maxIterations}) in while loop. Possible infinite loop.`
          );
        }
      }

      tempMovedLastPoint = {
        x: tempMovedLastPoint.x - (0.5 * shiftDirection.shiftX),
        y: tempMovedLastPoint.y - (0.5 * shiftDirection.shiftY),
      };

      const centerRightParts = splitLeftPolygonIntoTwo(leftAndCenterConcaves[1], tempMovedLastPoint)

      console.log('各種値', concavePoints, leftAndCenterConcaves, centerRightParts, tempMovedLastPoint);

      return {
        shift: shiftDirection, 
        leftPart: leftAndCenterConcaves[0], 
        centerPart: centerRightParts[0], 
        rightPart: centerRightParts[1]
      }

    } else {
      return {
        shift: shiftDirection, 
        leftPart: leftAndCenterConcaves[0], 
        centerPart: leftAndCenterConcaves[1], 
        rightPart: [{x: 0, y: 0}]
      }
    }
  }

  //　左右のパーツからNextConcavewの３パーツを計算する関数
  const getNextThreeParts = (sidePart: Point[], shiftDirection: Shift): ThreeParts[] => {
    const isShiftX = Math.abs(shiftDirection.shiftX) < epsilon;
  
    const standardValue = isShiftX ? sidePart[0].x : sidePart[0].y;
  
    const getCoordinate = (point: Point) => (isShiftX ? point.x : point.y);
  
    const indices = sidePart
      .map((point, index) => (Math.abs(getCoordinate(point) - standardValue) < epsilon ? index : -1))
      .filter((index) => index !== -1); // 無効な値 (-1) を除外
  
    const nonConsecutivePairs: [number, number][] = [];
    for (let i = 0; i < indices.length - 1; i++) {
      if (indices[i + 1] !== indices[i] + 1) {
        nonConsecutivePairs.push([indices[i], indices[i + 1]]);
      }
    }
  
    const extractedPoints: Point[][] = nonConsecutivePairs.map(
      ([start, end]) => sidePart.slice(start, end + 1) // 範囲で抜き出し
    );
  
    return extractedPoints.map((pointSet) => concaveToThreeParts(pointSet));
  };

  const onCompute = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {

        const counterClockwisePoitns = ensureCounterClockwise(polygonPoints);

        const processedPolygonPoints = processPoints(counterClockwisePoitns);

        const concaveParts = getConcaveParts(processedPolygonPoints);
        const threeParts = concaveToThreeParts(concaveParts[0]);
        //const nextThreeParts = getNextThreeParts(threeParts.rightPart, threeParts.shift);

        console.log('凹み部分', concaveParts);
        console.log('前処理1', processedPolygonPoints);
        console.log('3分割', threeParts);
        //console.log('次の凹み', nextThreeParts)

        setIsComputed(true);
      }
    }
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center' }}>
        <ComputeButton onClick={onCompute} />
      </div>
      <canvas
        ref={canvasRef}
        width={533}
        height={533}
        style={{ border: '1px solid #000' }}
      />
    </div>
  );
};

export default DrawPanelWithCompute;;