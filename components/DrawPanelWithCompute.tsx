import React, { useEffect, useRef, useState } from 'react';
import ComputeButton from './ComputeButton';
import { promises } from 'dns';

interface DrawPanelWithComputeProps {
  points: { x: number; y: number }[];
}

interface Point {
  x: number;
  y: number;
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

interface OrthogonalLine {
  direction: string; // x or y
  coordinateOfStandardPoint: Point;
}

interface LineSegment {
  start: Point;
  end: Point;
}

interface DividingLength {
  line: LineSegment;
  leftDividingLength: number;
  rightDividingLength: number;
  topDividingLength: number;
  bottomDividingLength: number;
  horizontalDividingLength: number;
  verticalDividingLength: number;
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
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
  
      // 点が辺上にある場合は内部ではないと判定
      if (isPointOnLineSegment(point, start, end)) {
        return false;
      }
    }
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

  // (メイン関数１）凹み部分を計算する
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
  // LeftPart専用
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

    const leftAndCenterConcaves = splitLeftPolygonIntoTwo(concavePoints, tempMovedFirstPoint)

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

      const centerRightParts = splitRightPolygonIntoTwo(leftAndCenterConcaves[1], tempMovedLastPoint)

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
  const getNextThreePartsFromSide = (sidePart: Point[], shiftDirection: Shift): ThreeParts[] => {
    const isShiftXZero = Math.abs(shiftDirection.shiftX) < epsilon;
  
    const standardValue = isShiftXZero ? sidePart[0].x : sidePart[0].y;
  
    const getCoordinate = (point: Point) => (isShiftXZero ? point.x : point.y);
  
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

  //　中央のパーツからNextConcaveの３パーツを計算する関数
  const getNextThreePartsFromCenter = (centerPart: Point[], shiftDirection: Shift): ThreeParts[] => {
    let standardValue = 0;
    const centerPartMiniMax = getMinMaxXY(centerPart);
  
    // centerPart をコピーして安全に操作
    const updatedCenterPart = [...centerPart];
  
    if (Math.abs(shiftDirection.shiftY) < epsilon) {
      if (shiftDirection.shiftX > 0) {
        standardValue = centerPartMiniMax.minX;
      } else {
        standardValue = centerPartMiniMax.maxX;
      }
  
      if (updatedCenterPart.length > 0 && Math.abs(updatedCenterPart[0].x - standardValue) > epsilon) {
        const additionalFirstPoint: Point = { x: standardValue, y: updatedCenterPart[0].y };
        updatedCenterPart.unshift(additionalFirstPoint);
      }
      if (
        updatedCenterPart.length > 0 &&
        Math.abs(updatedCenterPart[updatedCenterPart.length - 1].x - standardValue) > epsilon
      ) {
        const additionalLastPoint: Point = {
          x: standardValue,
          y: updatedCenterPart[updatedCenterPart.length - 1].y,
        };
        updatedCenterPart.push(additionalLastPoint);
      }
    } else {
      if (shiftDirection.shiftY > 0) {
        standardValue = centerPartMiniMax.minY;
      } else {
        standardValue = centerPartMiniMax.maxY;
      }
  
      if (updatedCenterPart.length > 0 && Math.abs(updatedCenterPart[0].y - standardValue) > epsilon) {
        const additionalFirstPoint: Point = { x: updatedCenterPart[0].x, y: standardValue };
        updatedCenterPart.unshift(additionalFirstPoint);
      }
      if (
        updatedCenterPart.length > 0 &&
        Math.abs(updatedCenterPart[updatedCenterPart.length - 1].y - standardValue) > epsilon
      ) {
        const additionalLastPoint: Point = {
          x: updatedCenterPart[updatedCenterPart.length - 1].x,
          y: standardValue,
        };
        updatedCenterPart.push(additionalLastPoint);
      }
    }

    const newShift: Shift = {
      shiftX: shiftDirection.shiftY,
      shiftY: shiftDirection.shiftX
    }
    const nextCenterPart: ThreeParts[] = getNextThreePartsFromSide(updatedCenterPart, newShift)
  
    return nextCenterPart;
  };
  
  // （メイン関数２）凹みの集合に対して、すべての3パーツを計算する方法
  function processConcaves(concaves: Point[][]): ThreeParts[] {
    // 出力のThreeParts[]を初期化
    const threePartsGroup: ThreeParts[] = [];
  
    // 操作1: 入力値の各要素にconcaveToThreePartsを適用
    const threes: ThreeParts[] = concaves.map(concaveToThreeParts);
    threePartsGroup.push(...threes);
  
    // 操作2および操作3を再帰的に実行
    function processThreeParts(threes: ThreeParts[]): void {
      const newParts: ThreeParts[] = [];
  
      threes.forEach((three) => {
        // leftPart の処理
        if (three.leftPart.length >= 3) {
          const nextParts = getNextThreePartsFromSide(three.leftPart, three.shift);
          newParts.push(...nextParts);
          threePartsGroup.push(...nextParts);
        }
  
        // rightPart の処理
        if (three.rightPart.length >= 3) {
          const nextParts = getNextThreePartsFromSide(three.rightPart, three.shift);
          newParts.push(...nextParts);
          threePartsGroup.push(...nextParts);
        }
  
        // centerPart の処理
        if (three.centerPart.length >= 3) {
          const nextParts = getNextThreePartsFromCenter(three.centerPart, three.shift);
          newParts.push(...nextParts);
          threePartsGroup.push(...nextParts);
        }
      });
  
      // 新たに生成された ThreeParts の中で要素数が3以上のものがあれば再帰的に処理
      if (newParts.some(
        (part) =>
          part.leftPart.length >= 3 ||
          part.rightPart.length >= 3 ||
          part.centerPart.length >= 3
      )) {
        processThreeParts(newParts);
      }
    }
  
    // 初期の threes に対して操作2と操作3を実行
    processThreeParts(threes);
  
    return threePartsGroup;
  }

  // 線分の向きを、左上から右下の向きに整える関数。
  function compareAndReorder(point1: Point, point2: Point): [Point, Point] {
    // 条件: 上かつ左の順序
    if (
      point1.y > point2.y || // y座標で上にある場合
      (point1.y === point2.y && point1.x < point2.x) // y座標が同じ場合はx座標で左
    ) {
      return [point1, point2];
    } else {
      return [point2, point1];
    }
  }

  // 多角形の頂点と直線上の2点を受け取り、 直線のうち多角形の内部にある部分の両端座標を列挙する関数
  function getLineSegmentsInsidePolygon(
    polygonVertices: Point[],
    linePoint1: Point,
    linePoint2: Point
  ): LineSegment[] {
    const intersections: Point[] = [];
    const isHorizontalLine = linePoint1.y === linePoint2.y;
    const isVerticalLine = linePoint1.x === linePoint2.x;
  
    if (!isHorizontalLine && !isVerticalLine) {
      throw new Error("The input line must be parallel or perpendicular to the x-axis.");
    }
  
    const n = polygonVertices.length;
  
    // 多角形の辺と直線の交点を記録
    for (let i = 0; i < n; i++) {
      const start = polygonVertices[i];
      const end = polygonVertices[(i + 1) % n];
  
      const isPolygonEdgeHorizontal = start.y === end.y;
      const isPolygonEdgeVertical = start.x === end.x;
  
      if (!isPolygonEdgeHorizontal && !isPolygonEdgeVertical) {
        throw new Error("Polygon edges must be parallel or perpendicular to the x-axis.");
      }
  
      let intersection: Point | null = null;
  
      if (isHorizontalLine && isPolygonEdgeVertical) {
        // 直線が水平で辺が垂直
        if (
          Math.min(start.y, end.y) <= linePoint1.y &&
          linePoint1.y <= Math.max(start.y, end.y)
        ) {
          intersection = { x: start.x, y: linePoint1.y };
        }
      } else if (isVerticalLine && isPolygonEdgeHorizontal) {
        // 直線が垂直で辺が水平
        if (
          Math.min(start.x, end.x) <= linePoint1.x &&
          linePoint1.x <= Math.max(start.x, end.x)
        ) {
          intersection = { x: linePoint1.x, y: start.y };
        }
      } else if (
        (isHorizontalLine && isPolygonEdgeHorizontal) ||
        (isVerticalLine && isPolygonEdgeVertical)
      ) {
        // 直線と辺が平行
        if (
          (isHorizontalLine && linePoint1.y === start.y) ||
          (isVerticalLine && linePoint1.x === start.x)
        ) {
          intersections.push(start); // 辺の始点
          intersections.push(end); // 辺の終点
        }
      }
  
      if (intersection) {
        intersections.push(intersection);
      }
    }
  
    // 連続する同じ点を削除
    const uniqueIntersections = intersections.filter(
      (point, index, array) =>
        index === 0 || !(point.x === array[index - 1].x && point.y === array[index - 1].y)
    );
  
    // x座標が小さい順に並べ替え。同じx座標ならy座標が小さい順
    uniqueIntersections.sort((a, b) => {
      if (a.x === b.x) {
        return a.y - b.y; // xが同じならyの小さい順
      }
      return a.x - b.x; // xの小さい順
    });
  
    console.log("Sorted unique intersections:", uniqueIntersections);
  
    // 交点を使ってセグメントを記録
    const segments: LineSegment[] = [];
    for (let i = 0; i < uniqueIntersections.length - 1; i++) {
      const p1 = uniqueIntersections[i];
      const p2 = uniqueIntersections[i + 1];
  
      // 条件: セグメントのどちらかの端点近傍に多角形内部の点が存在する
      const midPoint: Point = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      if (isPointInsidePolygon(midPoint, polygonVertices)) {
        console.log("Midpoint inside polygon:", midPoint);
        segments.push({ start: p1, end: p2 });
      } else {
        console.log("Midpoint not inside polygon:", midPoint);
      }
    }
  
    return segments;
  }
  
  // 折れ線の長さを計算する関数。
  function calculatePolylineLength(points: Point[]): number {
    if (points.length < 2) {
      // 点が1つ以下の場合、折れ線を作れないので長さは0
      return 0;
    }

    let totalLength = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      totalLength += Math.sqrt(dx * dx + dy * dy);
    }

    return totalLength;
  }

  // ３パーツから局所的な離し方を計算する関数
  const getLocalDividingLength = (
    threeParts: ThreeParts,
    polygon: Point[]
  ): DividingLength[] => {
    const lengthFromLeft = calculatePolylineLength(threeParts.leftPart);
    const lengthFromRight = calculatePolylineLength(threeParts.rightPart);
    let leftDividingLength = 0;
    let rightDividingLength = 0;
    let topDividingLength = 0;
    let bottomDividingLength = 0;
    const shift = threeParts.shift;
  
    if (shift.shiftX > 0) {
      topDividingLength = lengthFromLeft;
      bottomDividingLength = lengthFromRight;
    } else if (shift.shiftX < 0) {
      topDividingLength = lengthFromRight;
      bottomDividingLength = lengthFromLeft;
    } else if (shift.shiftY > 0) {
      leftDividingLength = lengthFromLeft;
      rightDividingLength = lengthFromRight;
    } else {
      leftDividingLength = lengthFromRight;
      rightDividingLength = lengthFromLeft;
    }
  
    const lineSegmentsFromLeft = getLineSegmentsInsidePolygon(
      polygon,
      threeParts.leftPart[0],
      threeParts.leftPart[threeParts.leftPart.length - 1]
    );
    const lineSegmentsFromRight = getLineSegmentsInsidePolygon(
      polygon,
      threeParts.rightPart[0],
      threeParts.rightPart[threeParts.rightPart.length - 1]
    );
  
    const results: DividingLength[] = [];
  
    if (lengthFromLeft > 0) {
      for (const Xi of lineSegmentsFromLeft) {
        const isMatchingEndPoint =
          Xi.end.x === threeParts.leftPart[threeParts.leftPart.length - 1].x &&
          Xi.end.y === threeParts.leftPart[threeParts.leftPart.length - 1].y;
  
        if (isMatchingEndPoint) {
          results.push({
            line: Xi,
            leftDividingLength: leftDividingLength,
            rightDividingLength: rightDividingLength,
            topDividingLength: topDividingLength,
            bottomDividingLength: bottomDividingLength,
            horizontalDividingLength: 0,
            verticalDividingLength: 0,
          });
        } else {
          results.push({
            line: Xi,
            leftDividingLength: 0,
            rightDividingLength: 0,
            topDividingLength: 0,
            bottomDividingLength: 0,
            horizontalDividingLength: Math.max(
              leftDividingLength,
              rightDividingLength
            ),
            verticalDividingLength: Math.max(
              topDividingLength,
              bottomDividingLength
            ),
          });
        }
      }
    }
  
    if (lengthFromRight > 0) {
      for (const Xi of lineSegmentsFromRight) {
        const isMatchingStartPoint =
          Xi.start.x === threeParts.rightPart[0].x &&
          Xi.start.y === threeParts.rightPart[0].y;
  
        if (isMatchingStartPoint) {
          results.push({
            line: Xi,
            leftDividingLength: leftDividingLength,
            rightDividingLength: rightDividingLength,
            topDividingLength: topDividingLength,
            bottomDividingLength: bottomDividingLength,
            horizontalDividingLength: 0,
            verticalDividingLength: 0,
          });
        } else {
          results.push({
            line: Xi,
            leftDividingLength: 0,
            rightDividingLength: 0,
            topDividingLength: 0,
            bottomDividingLength: 0,
            horizontalDividingLength: Math.max(
              leftDividingLength,
              rightDividingLength
            ),
            verticalDividingLength: Math.max(
              topDividingLength,
              bottomDividingLength
            ),
          });
        }
      }
    }

    console.log('途中経過', )
  
    return results;
  };

  // 局所的な離し方を統合して、大域的な離し方を計算する関数。
  const getGlobalDividingLength = (localDividingLength: DividingLength): DividingLength => {
    return
  }

  // 局所的な離し方からひだの衝突を計算する関数
  const getCollisionOfFolds = (globalDividingLength: DividingLength): OrthogonalLine => {
    return
  }
  

  const onCompute = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {

        const counterClockwisePoitns = ensureCounterClockwise(polygonPoints);
        const processedPolygonPoints = processPoints(counterClockwisePoitns);
        const concaveParts = getConcaveParts(processedPolygonPoints);
        const allThreeParts = processConcaves(concaveParts);
        const divide = getLocalDividingLength(allThreeParts[0], polygonPoints)
        const firstTreeParts = allThreeParts[0]
        const point1 = firstTreeParts.leftPart[0]
        const point2 = firstTreeParts.leftPart[firstTreeParts.leftPart.length - 1]
        const line = getLineSegmentsInsidePolygon(polygonPoints, point1, point2)

        console.log('前処理1', processedPolygonPoints);
        console.log('凹み部分', concaveParts);
        console.log('all three parts', allThreeParts)
        console.log('最初の離し方', divide)
        console.log('セグメント',firstTreeParts, polygonPoints, point1, point2, line)

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