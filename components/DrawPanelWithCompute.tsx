import React, { useEffect, useRef, useState } from 'react';
import ComputeButton from './ComputeButton';
import { promises } from 'dns';
import { getDefaultSettings } from 'http2';

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
 number: number;
}

interface LineSegment {
  start: Point;
  end: Point;
}

interface DividingLength {
  leftDivide: number,
  rightDivide: number
}

interface DividingLengthPerSegments {
  originalPart: Point[]
  line: LineSegment;
  leftDividingLength: number;
  rightDividingLength: number;
  topDividingLength: number;
  bottomDividingLength: number;
  horizontalDividingLength: number;
  verticalDividingLength: number;
}


interface DividingLengthPerLines {
  line: OrthogonalLine;
  length: number;
}

interface AdditionalLengthPerThreePart {
  line: OrthogonalLine;
  leftDividingLength: number;
  rightDividingLength: number;
  topDividingLength: number;
  bottomDividingLength: number;
}

interface CreasePattern {
  mountainfold: LineSegment[];
  valleyfold: LineSegment[];
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points: polygonPoints }) => {
  const [isComputed, setIsComputed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = 20;
  const epsilon = 1e-10;
  let maxIterations = 20;

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

  // 多角形全体をx座標、y座標にくっつける関数
  const normalizePoints = (points: Point[]): Point[] => {
    if (points.length === 0) return [];
  
    // x座標とy座標の最小値を求める
    const minX = Math.min(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
  
    // 各点からminX, minYを引いて新しい点を作成
    const normalizedPoints = points.map(point => ({
      x: point.x - minX,
      y: point.y - minY,
    }));
  
    return normalizedPoints;
  };
  
  
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

  function isSegmentOnLineSegment(segment: LineSegment, line: OrthogonalLine): boolean {
    const isHorizontal = line.direction === "x";
    const isVertical = line.direction === "y";
  
    if (isHorizontal) {
      return (
        segment.start.y === line.number &&
        segment.end.y === line.number &&
        segment.start.x <= line.number &&
        segment.end.x >= line.number
      );
    }
  
    if (isVertical) {
      return (
        segment.start.x === line.number &&
        segment.end.x === line.number &&
        segment.start.y <= line.number &&
        segment.end.y >= line.number
      );
    }
  
    return false;
  }

  function isPointOnPolyline(point: Point, polyline: Point[]): boolean {
    for (let i = 0; i < polyline.length - 1; i++) {
      if (isPointOnLineSegment(point, polyline[i], polyline[i + 1])) {
        return true;
      }
    }
    return false;
  }

  // 点pが線分p_0→p_1の左側に存在するか判定する関数。
  // 正なら左側、０なら直線上、負なら右側に存在。
  function isLeft(p: Point, p0: Point, p1: Point): number {
    return (p1.x - p0.x) * (p.y - p0.y) - (p.x - p0.x) * (p1.y - p0.y);
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
    if (points.length === 0) {
      return [];
    }
  
    // 1. 反時計回りにソート
    const counterClockwisePoints = ensureCounterClockwise(points);
  
    // 2. 座標を正規化
    const normalizedPoints = normalizePoints(counterClockwisePoints);
  
    // 3. 現在の processPoints の処理を適用
    const newPoints = normalizedPoints.slice(0, -1);
  
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
    let addedFirstPoint = false;
    let addedLastPoint = false;
  
    if (Math.abs(shiftDirection.shiftY) < epsilon) {
      if (shiftDirection.shiftX > 0) {
        standardValue = centerPartMiniMax.minX;
      } else {
        standardValue = centerPartMiniMax.maxX;
      }
  
      if (updatedCenterPart.length > 0 && Math.abs(updatedCenterPart[0].x - standardValue) > epsilon) {
        const additionalFirstPoint: Point = { x: standardValue, y: updatedCenterPart[0].y };
        updatedCenterPart.unshift(additionalFirstPoint);
        addedFirstPoint = true;
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
        addedLastPoint = true;
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
        addedFirstPoint = true;
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
        addedLastPoint = true;
      }
    }
  
    const newShift: Shift = {
      shiftX: shiftDirection.shiftY,
      shiftY: shiftDirection.shiftX,
    };
    const nextCenterPart: ThreeParts[] = getNextThreePartsFromSide(updatedCenterPart, newShift);
  
    // 追加された点に応じて nextCenterPart を変更
    if (addedFirstPoint) {
      nextCenterPart[0].leftPart = [{ x: 0, y: 0 }];
    }
    if (addedLastPoint) {
      nextCenterPart[nextCenterPart.length - 1].rightPart = [{ x: 0, y: 0 }];
    }
  
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
    function generateAllSubThreeParts(threes: ThreeParts[]): void {
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
        generateAllSubThreeParts(newParts);
      }
    }
  
    // 初期の threes に対して操作2と操作3を実行
    generateAllSubThreeParts(threes);
  
    return threePartsGroup;
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
  
    // 交点を使ってセグメントを記録
    const segments: LineSegment[] = [];
    for (let i = 0; i < uniqueIntersections.length - 1; i++) {
      const p1 = uniqueIntersections[i];
      const p2 = uniqueIntersections[i + 1];
  
      // 条件: セグメントのどちらかの端点近傍に多角形内部の点が存在する
      const midPoint: Point = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      if (isPointInsidePolygon(midPoint, polygonVertices)) {
        segments.push({ start: p1, end: p2 });
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

  // 3パーツから、左右の離し方を計算する関数
  const calculateDividingLengths = (threePart: ThreeParts): DividingLength => {
    // 左パートと右パートの長さを計算
    const leftPolylineLength = calculatePolylineLength(threePart.leftPart);
    const rightPolylineLength = calculatePolylineLength(threePart.rightPart);
  
    // 左パートのカウント数を計算
    const calculateGapForBend = (part: Point[], shift: Shift, isLeftPart: boolean): number => {
      if (!Array.isArray(part) || part.length < 2) {
        return 0;
      }
    
      let count = 0;
    
      // 1. 各点を頭から3つずつ取り出してチェック
      if (part.length > 2) {
        for (let i = 0; i < part.length - 2; i++) {
          const pi = part[i];
          const pi1 = part[i + 1];
          const pi2 = part[i + 2];
    
          if (pi && pi1 && pi2 && isLeft(pi2, pi, pi1) < 0) {
            count++;
          }
        }
      }
    
      // 2. 端点のベクトルが `shift` と平行かどうかを判定
      const isParallel = (vec1: Point, vec2: Shift): boolean => {
        return vec1.x * vec2.shiftY === vec1.y * vec2.shiftX;
      };
    
      if (isLeftPart && part.length >= 2) {
        const lastVec: Point = {
          x: (part[part.length - 1]?.x || 0) - (part[part.length - 2]?.x || 0),
          y: (part[part.length - 1]?.y || 0) - (part[part.length - 2]?.y || 0),
        };
        if (isParallel(lastVec, shift)) {
          count++;
        }
      } else if (!isLeftPart && part.length >= 2) {
        const firstVec: Point = {
          x: (part[1]?.x || 0) - (part[0]?.x || 0),
          y: (part[1]?.y || 0) - (part[0]?.y || 0),
        };
        if (isParallel(firstVec, shift)) {
          count++;
        }
      }
    
      return count * scale; // スケールを掛けた結果を返す
    };
    
  
    // 左パートと右パートのギャップ計算
    const leftGapForBend = calculateGapForBend(threePart.leftPart, threePart.shift, true);
    const rightGapForBend = calculateGapForBend(threePart.rightPart, threePart.shift, false);
  
    // leftDivide と rightDivide の計算
    const leftDivide = leftPolylineLength + leftGapForBend;
    const rightDivide = rightPolylineLength + rightGapForBend;
  
    // DividingLength オブジェクトを返す
    return {
      leftDivide,
      rightDivide,
    };
  };
  
  // １つの３パーツから導かれる離し方をセグメントに格納する関数
  const threePartsToDividingLength = (
    threeParts: ThreeParts,
    polygon: Point[]
  ): DividingLengthPerSegments[] => {
    // Calculate lengths
    const dividingLenght = calculateDividingLengths(threeParts)
    const lengthFromLeft = dividingLenght.leftDivide
    const lengthFromRight = dividingLenght.rightDivide

    const storeNumbersInSegments = (
      part: Point[],
      length: number,
      shift: Shift,
      isLeft: boolean
    ) => {
      let leftDividingLength = 0;
      let rightDividingLength = 0;
      let topDividingLength = 0;
      let bottomDividingLength = 0;
  
      if (shift.shiftX > 0) {
        topDividingLength = isLeft ? length : 0;
        bottomDividingLength = isLeft ? 0 : length;
      } else if (shift.shiftX < 0) {
        bottomDividingLength = isLeft ? length : 0;
        topDividingLength = isLeft ? 0 : length;
      } else if (shift.shiftY > 0) {
        leftDividingLength = isLeft ? length : 0;
        rightDividingLength = isLeft ? 0 : length;
      } else {
        rightDividingLength = isLeft ? length : 0;
        leftDividingLength = isLeft ? 0 : length;
      }
  
      const lineSegments = getLineSegmentsInsidePolygon(
        polygon,
        part[0],
        part[part.length - 1]
      );
  
      const results: DividingLengthPerSegments[] = [];
      for (const segment of lineSegments) {
        // isMatchingPointは、線分セグメントがパーツと接触しているかを判定する変数。
        const isMatchingPoint = isLeft
          ? (segment.start.x === part[1].x && segment.start.y === part[1].y) || (segment.end.x === part[1].x && segment.end.y === part[1].y)
          : (segment.start.x === part[part.length - 2].x && segment.start.y === part[part.length - 2].y) || (segment.end.x === part[part.length - 2].x && segment.end.y === part[part.length - 2].y);
  
        results.push({
          originalPart: part,
          line: segment,
          leftDividingLength: isMatchingPoint ? leftDividingLength : 0,
          rightDividingLength: isMatchingPoint ? rightDividingLength : 0,
          topDividingLength: isMatchingPoint ? topDividingLength : 0,
          bottomDividingLength: isMatchingPoint ? bottomDividingLength : 0,
          horizontalDividingLength: Math.max(leftDividingLength, rightDividingLength),
          verticalDividingLength:　Math.max(topDividingLength, bottomDividingLength),
        });
      }
      return results;
    };
  
    const leftResults = lengthFromLeft > 0
      ? storeNumbersInSegments(threeParts.leftPart, lengthFromLeft, threeParts.shift, true)
      : [];
    const rightResults = lengthFromRight > 0
      ? storeNumbersInSegments(threeParts.rightPart, lengthFromRight, threeParts.shift, false)
      : [];
  
    return [...leftResults, ...rightResults];
  };

  //　すべてのパーツの離し方を計算する
  const getLocalDividingLength = (
    threePartsArray: ThreeParts[],
    polygon: Point[]
  ): DividingLengthPerSegments[] => {
    // 入力値の各要素に対して threePartsToDividingLength を適用し、すべての結果をまとめる
    const results: DividingLengthPerSegments[] = threePartsArray.flatMap((threeParts) =>
      threePartsToDividingLength(threeParts, polygon)
    );
  
    return results;
  };

  // ローカルの不都合な結合の回避のための前処理
  const processLocalDividingLength = (
    dividingLengthPerSegments: DividingLengthPerSegments[]
  ): DividingLengthPerSegments[] => {
    // グループ分け：line が同じもの同士でグループ化
    const grouped = dividingLengthPerSegments.reduce((acc, current) => {
      const key = JSON.stringify(current.line); // LineSegment をキーとしてグループ化
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(current);
      return acc;
    }, {} as Record<string, DividingLengthPerSegments[]>);
  
    // グループごとの統合処理
    const results: DividingLengthPerSegments[] = [];
  
    for (const group of Object.values(grouped)) {
      let mergedGroup = [...group]; // 作業用コピー
  
      // グループ内で条件を満たす組を探して統合
      let hasMerged = true;
      while (hasMerged) {
        hasMerged = false;
  
        for (let i = 0; i < mergedGroup.length; i++) {
          for (let j = i + 1; j < mergedGroup.length; j++) {
            const part1 = mergedGroup[i];
            const part2 = mergedGroup[j];
  
            // originalPart の端点が一致するかを判定
            const endpointsMatch =
              (part1.originalPart[0].x === part2.originalPart[0].x &&
                part1.originalPart[0].y === part2.originalPart[0].y) ||
              (part1.originalPart[0].x === part2.originalPart[part2.originalPart.length - 1].x &&
                part1.originalPart[0].y === part2.originalPart[part2.originalPart.length - 1].y) ||
              (part1.originalPart[part1.originalPart.length - 1].x === part2.originalPart[0].x &&
                part1.originalPart[part1.originalPart.length - 1].y === part2.originalPart[0].y) ||
              (part1.originalPart[part1.originalPart.length - 1].x === part2.originalPart[part2.originalPart.length - 1].x &&
                part1.originalPart[part1.originalPart.length - 1].y === part2.originalPart[part2.originalPart.length - 1].y);
  
            if (endpointsMatch) {
              // 組を統合
              const merged: DividingLengthPerSegments = {
                originalPart: [...part1.originalPart, ...part2.originalPart], // 結合した originalPart
                line: part1.line, // 同じ line を共有
                leftDividingLength: part1.leftDividingLength + part2.leftDividingLength,
                rightDividingLength: part1.rightDividingLength + part2.rightDividingLength,
                topDividingLength: part1.topDividingLength + part2.topDividingLength,
                bottomDividingLength: part1.bottomDividingLength + part2.bottomDividingLength,
                horizontalDividingLength: part1.horizontalDividingLength + part2.horizontalDividingLength,
                verticalDividingLength: part1.verticalDividingLength + part2.verticalDividingLength,
              };
  
              // 統合結果で置き換え、統合済みフラグを立てる
              mergedGroup.splice(j, 1); // j を削除
              mergedGroup.splice(i, 1, merged); // i を置き換え
              hasMerged = true;
              break;
            }
          }
          if (hasMerged) break;
        }
      }
  
      // グループが統合された結果を追加
      results.push(...mergedGroup);
    }
  
    return results;
  };
  
  // 局所的な離し方を統合して、大域的な離し方を計算する関数。
  const getGlobalDividingLength = (
    processLocalDividingLength: DividingLengthPerSegments[]
  ): DividingLengthPerSegments[] => {
    // グループ化関数
    const groupBy = <T, K>(array: T[], getKey: (item: T) => K): Map<K, T[]> => {
      return array.reduce((map, item) => {
        const key = getKey(item);
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key)!.push(item);
        return map;
      }, new Map<K, T[]>());
    };
  
    // 1. lineが同一直線上に存在するものでグループ化
    const lineGroups = groupBy(processLocalDividingLength, (segment) =>
      JSON.stringify({
        startSlope: segment.line.start.x === segment.line.end.x
          ? Infinity
          : (segment.line.end.y - segment.line.start.y) /
            (segment.line.end.x - segment.line.start.x),
        intercept: segment.line.start.x === segment.line.end.x
          ? segment.line.start.x
          : segment.line.start.y -
            (segment.line.end.y - segment.line.start.y) /
              (segment.line.end.x - segment.line.start.x) *
              segment.line.start.x,
      })
    );
  
    // 統合結果を格納するリスト
    const results: DividingLengthPerSegments[] = [];
  
    // 各グループに対する処理
    for (const group of lineGroups.values()) {
      // グループ内の horizontalDividingLength と verticalDividingLength の最大値を取得
      const maxHorizontal = Math.max(
        ...group.map((d) => d.horizontalDividingLength)
      );
      const maxVertical = Math.max(
        ...group.map((d) => d.verticalDividingLength)
      );
  
      // 2. lineが完全に一致するものでさらにグループ化
      const exactLineGroups = groupBy(group, (segment) =>
        JSON.stringify(segment.line)
      );
  
      for (const exactGroup of exactLineGroups.values()) {
        // グループ内の left, right, top, bottom の最大値を取得
        const maxLeft = Math.max(
          ...exactGroup.map((d) => d.leftDividingLength)
        );
        const maxRight = Math.max(
          ...exactGroup.map((d) => d.rightDividingLength)
        );
        const maxTop = Math.max(
          ...exactGroup.map((d) => d.topDividingLength)
        );
        const maxBottom = Math.max(
          ...exactGroup.map((d) => d.bottomDividingLength)
        );
  
        // グループ内の代表値を選択
        const representativeSegment = exactGroup[0];
  
        // 統合結果を作成
        results.push({
          originalPart: representativeSegment.originalPart, // 代表値
          line: representativeSegment.line, // 同一グループのlineはすべて同じ
          leftDividingLength: maxLeft,
          rightDividingLength: maxRight,
          topDividingLength: maxTop,
          bottomDividingLength: maxBottom,
          horizontalDividingLength: maxHorizontal,
          verticalDividingLength: maxVertical,
        });
      }
    }
  
    return results;
  };

  // セグメントごとの大域的離し方を直線ごとに変換する関数
  const convertToGlobalDividingLengthPerLines = (
    segments: DividingLengthPerSegments[]
  ): DividingLengthPerLines[] => {
    const groupedByLine = new Map<string, { orthogonalLine: OrthogonalLine; maxLength: number }>();
  
    segments.forEach(segment => {
      const isHorizontal = segment.line.start.y === segment.line.end.y;
      const isVertical = segment.line.start.x === segment.line.end.x;
  
      if (!isHorizontal && !isVertical) {
        throw new Error("Segments must be either horizontal or vertical.");
      }
  
      const orthogonalLine: OrthogonalLine = isHorizontal
        ? { direction: "y", number: segment.line.start.y }
        : { direction: "x", number: segment.line.start.x };
  
      const key = `${orthogonalLine.direction}=${orthogonalLine.number}`;
  
      // 最大値を計算
      const segmentMaxLength = Math.max(
        segment.leftDividingLength,
        segment.rightDividingLength,
        segment.topDividingLength,
        segment.bottomDividingLength,
        segment.horizontalDividingLength,
        segment.verticalDividingLength
      );
  
      if (!groupedByLine.has(key)) {
        groupedByLine.set(key, { orthogonalLine, maxLength: segmentMaxLength });
      } else {
        const group = groupedByLine.get(key)!;
        group.maxLength = Math.max(group.maxLength, segmentMaxLength);
      }
    });
  
    return Array.from(groupedByLine.values())
      .map(group => ({
        line: group.orthogonalLine,
        length: group.maxLength, 
      }))
      .sort((a, b) => {
        if (a.line.direction === "x" && b.line.direction === "y") return -1;
        if (a.line.direction === "y" && b.line.direction === "x") return 1;
        return a.line.number - b.line.number;
      });
  };

  // Centerから派生したThreeParts を取得する関数
  function getNextThreePartOnlyCenter(threePart: ThreeParts[]): ThreeParts[] {
    const threePartsGroup: ThreeParts[] = [...threePart];

    function nextThreePartsFromCenter(threes: ThreeParts[]): void {
      const newParts: ThreeParts[] = [];

      threes.forEach((three) => {
        if (three.centerPart.length >= 3) {
          const nextParts = getNextThreePartsFromCenter(three.centerPart, three.shift);
          newParts.push(...nextParts);
          threePartsGroup.push(...nextParts);
        }
      });

      if (
        newParts.some(
          (part) =>
            part.leftPart.length >= 3 ||
            part.rightPart.length >= 3 ||
            part.centerPart.length >= 3
        )
      ) {
        nextThreePartsFromCenter(newParts);
      }
    }

    nextThreePartsFromCenter(threePart);
    return threePartsGroup;
  }
  
  //１つのThreePartに対して、左右の追加Diveideを計算する方法。
  const additionalLRDividePerThreePart = (threePart: ThreeParts, globalDividePerLine: DividingLengthPerLines[], polygon:Point[]): AdditionalLengthPerThreePart[] => {
    const threeParts = [threePart]

    function getAdditionalThreePart(threePart: ThreeParts[]): ThreeParts[] {
      // 出力のThreeParts[]を初期化
      const threePartsGroup: ThreeParts[] = [];
    
      // 操作1: 入力値の各要素にconcaveToThreePartsを適用
      const threes: ThreeParts[] = threePart
      threePartsGroup.push(...threes);
    
      // 操作2および操作3を再帰的に実行
      function processThreePartsFromCenter(threes: ThreeParts[]): void {
        const newParts: ThreeParts[] = [];
    
        threes.forEach((three) => {

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
          processThreePartsFromCenter(newParts);
        }
      }
    
      // 初期の threes に対して操作2と操作3を実行
      processThreePartsFromCenter(threes);
    
      return threePartsGroup;
    }

    const threePartOnlyCenter = getAdditionalThreePart(threeParts);
    const uniqueDivide = getLocalDividingLength(threePartOnlyCenter, polygon)
    const processedUniqueDivide = processLocalDividingLength(uniqueDivide)
    const uniquwGlobalDividingLengthPerSegments = getGlobalDividingLength(processedUniqueDivide)
    const uniqueGlobalDividingLengthPerLine = convertToGlobalDividingLengthPerLines(uniquwGlobalDividingLengthPerSegments)

    const calculateLRAdditionalLength = (
      globalDivide: DividingLengthPerLines[],
      additionalGlobalDivide: DividingLengthPerLines[],
      threeParts: ThreeParts
    ): AdditionalLengthPerThreePart[] => {
      const result: AdditionalLengthPerThreePart[] = [];
    
      if (threeParts.shift.shiftX > 0) {
        const centerPartLength = threeParts.centerPart.length;
        const leftPartLength = threeParts.leftPart.length;
        const rightPartLength = threeParts.rightPart.length;
    
        // centerPartの要素数が1以下
        if (centerPartLength <= 1) {
          // leftPartまたはrightPartの要素数が1以下のときは何もしない
          if (leftPartLength <= 1 || rightPartLength <= 1) {
            return [];
          }
    
          // leftPartとrightPartの要素数がともに2以上のとき
          if (leftPartLength >= 2 && rightPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "y",
              number: threeParts.leftPart[0].y,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: 0,
                  rightDividingLength: 0,
                  topDividingLength: 0,
                  bottomDividingLength: lengthDifference,
                });
              }
            }
          }
        }
    
        // centerPartの要素数が2以上
        if (centerPartLength >= 2) {
          // leftPartの要素数が2以上の場合
          if (leftPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "y",
              number: threeParts.leftPart[0].y,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: 0,
                  rightDividingLength: 0,
                  topDividingLength: lengthDifference,
                  bottomDividingLength: 0,
                });
              }
            }
          }
    
          // rightPartの要素数が2以上の場合
          if (rightPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "y",
              number: threeParts.rightPart[0].y,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: 0,
                  rightDividingLength: 0,
                  topDividingLength: 0,
                  bottomDividingLength: lengthDifference,
                });
              }
            }
          }
        }
      }

      if (threeParts.shift.shiftX < 0) {
        const centerPartLength = threeParts.centerPart.length;
        const leftPartLength = threeParts.leftPart.length;
        const rightPartLength = threeParts.rightPart.length;
    
        // centerPartの要素数が1以下
        if (centerPartLength <= 1) {
          // leftPartまたはrightPartの要素数が1以下のときは何もしない
          if (leftPartLength <= 1 || rightPartLength <= 1) {
            return [];
          }
    
          // leftPartとrightPartの要素数がともに2以上のとき
          if (leftPartLength >= 2 && rightPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "y",
              number: threeParts.leftPart[0].y,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: 0,
                  rightDividingLength: 0,
                  topDividingLength: 0,
                  bottomDividingLength: lengthDifference,
                });
              }
            }
          }
        }
    
        // centerPartの要素数が2以上
        if (centerPartLength >= 2) {
          // leftPartの要素数が2以上の場合
          if (leftPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "y",
              number: threeParts.leftPart[0].y,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: 0,
                  rightDividingLength: 0,
                  topDividingLength: 0,
                  bottomDividingLength: lengthDifference,
                });
              }
            }
          }
    
          // rightPartの要素数が2以上の場合
          if (rightPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "y",
              number: threeParts.rightPart[0].y,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "y" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: 0,
                  rightDividingLength: 0,
                  topDividingLength: lengthDifference,
                  bottomDividingLength: 0,
                });
              }
            }
          }
        }
      }

      if (threeParts.shift.shiftY > 0) {
        const centerPartLength = threeParts.centerPart.length;
        const leftPartLength = threeParts.leftPart.length;
        const rightPartLength = threeParts.rightPart.length;
    
        // centerPartの要素数が1以下
        if (centerPartLength <= 1) {
          // leftPartまたはrightPartの要素数が1以下のときは何もしない
          if (leftPartLength <= 1 || rightPartLength <= 1) {
            return [];
          }
    
          // leftPartとrightPartの要素数がともに2以上のとき
          if (leftPartLength >= 2 && rightPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "x",
              number: threeParts.leftPart[0].x,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: lengthDifference,
                  rightDividingLength: 0,
                  topDividingLength: 0,
                  bottomDividingLength: 0,
                });
              }
            }
          }
        }
    
        // centerPartの要素数が2以上
        if (centerPartLength >= 2) {
          // leftPartの要素数が2以上の場合
          if (leftPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "x",
              number: threeParts.leftPart[0].x,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: lengthDifference,
                  rightDividingLength: 0,
                  topDividingLength: 0,
                  bottomDividingLength: 0,
                });
              }
            }
          }
    
          // rightPartの要素数が2以上の場合
          if (rightPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "x",
              number: threeParts.rightPart[0].x,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: 0,
                  rightDividingLength: lengthDifference,
                  topDividingLength: 0,
                  bottomDividingLength: 0,
                });
              }
            }
          }
        }
      }

      if (threeParts.shift.shiftY < 0) {
        const centerPartLength = threeParts.centerPart.length;
        const leftPartLength = threeParts.leftPart.length;
        const rightPartLength = threeParts.rightPart.length;
    
        // centerPartの要素数が1以下
        if (centerPartLength <= 1) {
          // leftPartまたはrightPartの要素数が1以下のときは何もしない
          if (leftPartLength <= 1 || rightPartLength <= 1) {
            return [];
          }
    
          // leftPartとrightPartの要素数がともに2以上のとき
          if (leftPartLength >= 2 && rightPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "x",
              number: threeParts.leftPart[0].x,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: lengthDifference,
                  rightDividingLength: 0,
                  topDividingLength: 0,
                  bottomDividingLength: 0,
                });
              }
            }
          }
        }
    
        // centerPartの要素数が2以上
        if (centerPartLength >= 2) {
          // leftPartの要素数が2以上の場合
          if (leftPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "x",
              number: threeParts.leftPart[0].x,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: 0,
                  rightDividingLength: lengthDifference,
                  topDividingLength: 0,
                  bottomDividingLength: 0,
                });
              }
            }
          }
    
          // rightPartの要素数が2以上の場合
          if (rightPartLength >= 2) {
            const line: OrthogonalLine = {
              direction: "x",
              number: threeParts.rightPart[0].x,
            };
    
            const line1 = globalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
            const line2 = additionalGlobalDivide.find((d) => d.line.direction === "x" && d.line.number === line.number);
    
            if (line1 && line2) {
              const lengthDifference = line1.length - line2.length;
              if (lengthDifference > 0) {
                result.push({
                  line,
                  leftDividingLength: lengthDifference,
                  rightDividingLength: 0,
                  topDividingLength: 0,
                  bottomDividingLength: 0,
                });
              }
            }
          }
        }
      }
    
      return result;
    };
    
    return calculateLRAdditionalLength(globalDividePerLine, uniqueGlobalDividingLengthPerLine, threePart)
  }

  // ThreePartの入口に対する追加Divideを計算する。
  const additionalDividingPerThreePart = (
    threePart: ThreeParts,
    globalDividePerLine: DividingLengthPerLines[],
    globalDividePerSegments: DividingLengthPerSegments[],
    polygon: Point[]
  ): AdditionalLengthPerThreePart[] => {

    // 入力値を配列に変換
    const threePartsArray = [threePart];
  
    // additional ThreeParts を取得する関数
  
    const additionalThreeParts = getNextThreePartOnlyCenter(threePartsArray);

    // すべての ThreeParts に `additionalLRDividePerThreePart` を適用
    const result1 = additionalThreeParts.flatMap(threePart => {
      const additionalParts = additionalLRDividePerThreePart(threePart, globalDividePerLine, polygon);
    
      // フィルタリング: 不要な成分を除外
      const filteredParts = additionalParts.filter(part => {
        const isValid =
          part && // `part` が null または undefined ではない
          Object.keys(part).length > 0 && // 空オブジェクトではない
          part.line && // `line` プロパティが存在する
          typeof part.line.direction === "string" && // `line.direction` が文字列である
          typeof part.line.number === "number" && // `line.number` が数値である
          Object.values(part).some(value => value > 0); // 少なくとも1つの分割長が正の値
    
        if (!isValid) {
          console.warn("Filtered out invalid part:", part);
        }
        return isValid;
      });
    
      return filteredParts;
    });
    
    // 最終結果の要素数をログ出力
  
    const additionalLocalDivide = getLocalDividingLength(additionalThreeParts, polygon);

    function convertSegmentsToAdditionalLengths(
      additionalLocalDivide: DividingLengthPerSegments[],
      globalDividePerSegments: DividingLengthPerSegments[],
      threePart: ThreeParts
    ): AdditionalLengthPerThreePart[] {
      const result: AdditionalLengthPerThreePart[] = [];
    
      // ポリライン上の点を判定するヘルパー関数
      const isPointOnPolyline = (point: Point, polyline: Point[]): boolean => {
        for (let i = 0; i < polyline.length - 1; i++) {
          const start = polyline[i];
          const end = polyline[i + 1];
          if (
            (point.x - start.x) * (end.y - start.y) === (point.y - start.y) * (end.x - start.x) &&
            Math.min(start.x, end.x) <= point.x &&
            point.x <= Math.max(start.x, end.x) &&
            Math.min(start.y, end.y) <= point.y &&
            point.y <= Math.max(start.y, end.y)
          ) {
            return true;
          }
        }
        return false;
      };
    
      // additionalLocalDivide から方向を取得（すべて平行）
      const additionalDirections = new Set(
        additionalLocalDivide.map((segment) =>
          segment.line.start.x === segment.line.end.x ? "x" : "y"
        )
      );
    
      // globalDividePerSegments を一つずつ確認
      for (const globalSegment of globalDividePerSegments) {
        const { line } = globalSegment;
    
        // 条件1: globalSegment.line の端点のいずれかが threePart.centerPart がなすポリライン上に存在する
        const isStartOnCenterPolyline = isPointOnPolyline(line.start, threePart.centerPart);
        const isEndOnCenterPolyline = isPointOnPolyline(line.end, threePart.centerPart);
    
        if (!(isStartOnCenterPolyline || isEndOnCenterPolyline)) {
          continue;
        }
    
        // 条件2: 端点が additionalLocalDivide.line のどの直線上にも存在しない
        const isStartOnAnyLocalLine = additionalLocalDivide.some((localSegment) => {
          const direction = localSegment.line.start.x === localSegment.line.end.x ? "x" : "y";
          if (direction === "x") {
            return (
              localSegment.line.start.x === line.start.x ||
              localSegment.line.start.x === line.end.x
            );
          } else {
            return (
              localSegment.line.start.y === line.start.y ||
              localSegment.line.start.y === line.end.y
            );
          }
        });
    
        const isEndOnAnyLocalLine = additionalLocalDivide.some((localSegment) => {
          const direction = localSegment.line.start.x === localSegment.line.end.x ? "x" : "y";
          if (direction === "x") {
            return (
              localSegment.line.start.x === line.start.x ||
              localSegment.line.start.x === line.end.x
            );
          } else {
            return (
              localSegment.line.start.y === line.start.y ||
              localSegment.line.start.y === line.end.y
            );
          }
        });
    
        if (isStartOnAnyLocalLine || isEndOnAnyLocalLine) {
          continue;
        }
    
        // 条件3: globalSegment.line が additionalLocalDivide.line と平行である
        const direction = line.start.x === line.end.x ? "x" : "y";
        if (!additionalDirections.has(direction)) {
          continue;
        }
    
        // 条件を満たす場合、DividingLengthPerSegments を AdditionalLengthPerThreePart に変換
        const additionalPart: AdditionalLengthPerThreePart = {
          line: {
            direction,
            number: direction === "x" ? line.start.x : line.start.y,
          },
          leftDividingLength: globalSegment.leftDividingLength || 0,
          rightDividingLength: globalSegment.rightDividingLength || 0,
          topDividingLength: globalSegment.topDividingLength || 0,
          bottomDividingLength: globalSegment.bottomDividingLength || 0,
        };
    
        // 空のデータを防ぐために検証
        if (
          additionalPart.line &&
          typeof additionalPart.line.direction === "string" &&
          typeof additionalPart.line.number === "number" &&
          Object.values(additionalPart).some((value) => value > 0)
        ) {
          result.push(additionalPart);
        }
      }
    
      return result;
    }
    

    const result2 = convertSegmentsToAdditionalLengths(additionalLocalDivide, globalDividePerSegments, threePart);

    function mergeAndSortAdditionalLengths(
      arr1: AdditionalLengthPerThreePart[],
      arr2: AdditionalLengthPerThreePart[]
    ): AdditionalLengthPerThreePart[] {
      // 配列を統合
      const mergedArray = [...arr1, ...arr2];
    
      // ソート処理
      mergedArray.sort((a, b) => {
        // 最優先: line.direction が "x" のものが前に来る
        if (a.line.direction === "x" && b.line.direction !== "x") {
          return -1; // a を前に
        }
        if (a.line.direction !== "x" && b.line.direction === "x") {
          return 1; // b を前に
        }
    
        // 次に優先: line.number が小さいものが前に来る
        return a.line.number - b.line.number;
      });
    
      return mergedArray;
    }

    const result = mergeAndSortAdditionalLengths(result1, result2);
    
    
    return result;
  };

  function mergeCreasePatterns(patterns: (CreasePattern | undefined | null)[]): CreasePattern {
    return patterns.reduce(
      (merged, current) => {
        // current が null または undefined の場合はスキップ
        if (!current) return merged;
  
        // mountainfold と valleyfold を結合
        return {
          mountainfold: [...merged.mountainfold, ...current.mountainfold],
          valleyfold: [...merged.valleyfold, ...current.valleyfold],
        };
      },
      { mountainfold: [], valleyfold: [] } // 初期値
    );
  }


  function generateAdditionalLengths(
    threePart: ThreeParts,
    globalDividePerSegments: DividingLengthPerSegments[],
  ): AdditionalLengthPerThreePart[][] {
    const leftAdd: AdditionalLengthPerThreePart[] = [];
    const rightAdd: AdditionalLengthPerThreePart[] = [];
  
    // ヘルパー関数: 直線が多角形と交差しているか判定
    function isLineSegmentIntersectingPolygon(line: LineSegment, polygon: Point[]): boolean {
      const n = polygon.length;
  
      for (let i = 0; i < n; i++) {
        const polygonEdge: LineSegment = {
          start: polygon[i],
          end: polygon[(i + 1) % n],
        };
  
        if (doLineSegmentsIntersect(line, polygonEdge)) {
          return true;
        }
      }
      return false;
    }
  
    // ヘルパー関数: 線分の交差判定
    function doLineSegmentsIntersect(line1: LineSegment, line2: LineSegment): boolean {
      function orientation(p: Point, q: Point, r: Point): number {
        const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        if (val === 0) return 0; // colinear
        return val > 0 ? 1 : 2; // clock or counterclockwise
      }
  
      const { start: p1, end: q1 } = line1;
      const { start: p2, end: q2 } = line2;
  
      const o1 = orientation(p1, q1, p2);
      const o2 = orientation(p1, q1, q2);
      const o3 = orientation(p2, q2, p1);
      const o4 = orientation(p2, q2, q1);
  
      // General case
      if (o1 !== o2 && o3 !== o4) return true;
  
      return false; // No intersection
    }
  
    // ThreeParts.leftPart の処理
    if (threePart.leftPart.length >= 2) {
      const leftLine: LineSegment = {
        start: threePart.leftPart[0],
        end: threePart.leftPart[threePart.leftPart.length - 1],
      };
  
      globalDividePerSegments.forEach((segment) => {
        const isOrthogonal = segment.line.start.y === segment.line.end.y
          ? leftLine.start.x === leftLine.end.x
          : leftLine.start.y === leftLine.end.y;
  
        const isIntersecting = isLineSegmentIntersectingPolygon(segment.line, threePart.leftPart);
  
        const isValidIntersection =
          isOrthogonal &&
          isIntersecting &&
          segment.line.start !== threePart.leftPart[0] &&
          segment.line.end !== threePart.leftPart[threePart.leftPart.length - 1];
  
        if (isValidIntersection) {
          const additionalPart: AdditionalLengthPerThreePart = {
            line: {
              direction: segment.line.start.x === segment.line.end.x ? "x" : "y",
              number: segment.line.start.x === segment.line.end.x
                ? segment.line.start.x
                : segment.line.start.y,
            },
            leftDividingLength: segment.leftDividingLength,
            rightDividingLength: segment.rightDividingLength,
            topDividingLength: segment.topDividingLength,
            bottomDividingLength: segment.bottomDividingLength,
          };
  
          leftAdd.push(additionalPart);
        }
      });
    }
  
    // ThreeParts.rightPart の処理
    if (threePart.rightPart.length >= 2) {
      const rightLine: LineSegment = {
        start: threePart.rightPart[0],
        end: threePart.rightPart[threePart.rightPart.length - 1],
      };
  
      globalDividePerSegments.forEach((segment) => {
        const isOrthogonal = segment.line.start.y === segment.line.end.y
          ? rightLine.start.x === rightLine.end.x
          : rightLine.start.y === rightLine.end.y;
  
        const isIntersecting = isLineSegmentIntersectingPolygon(segment.line, threePart.rightPart);
  
        const isValidIntersection =
          isOrthogonal &&
          isIntersecting &&
          segment.line.start !== threePart.rightPart[0] &&
          segment.line.end !== threePart.rightPart[threePart.rightPart.length - 1];
  
        if (isValidIntersection) {
          const additionalPart: AdditionalLengthPerThreePart = {
            line: {
              direction: segment.line.start.x === segment.line.end.x ? "x" : "y",
              number: segment.line.start.x === segment.line.end.x
                ? segment.line.start.x
                : segment.line.start.y,
            },
            leftDividingLength: segment.leftDividingLength,
            rightDividingLength: segment.rightDividingLength,
            topDividingLength: segment.topDividingLength,
            bottomDividingLength: segment.bottomDividingLength,
          };
  
          rightAdd.push(additionalPart);
        }
      });
    }
  
    return [leftAdd, rightAdd];
  }
  
  
  // ThreePartの折り線の計算
  const generateThreePartCreasePattern = (
    threePart: ThreeParts, 
    globalDivide: DividingLengthPerLines[],
    globalDividePerSegments: DividingLengthPerSegments[],
    polygon:Point[]): CreasePattern => {
      
    const centerLRAddition = additionalLRDividePerThreePart(threePart, globalDivide, polygon);
    console.log("ローカル左右", threePart, centerLRAddition)

    const sideAdd = generateAdditionalLengths(threePart, globalDividePerSegments)
    console.log(sideAdd)

    let centerAddFromLeft: number = 0;
    let centerAddFromRight: number = 0;

    // 戻り値が配列であるか、空でないかを確認
    if (Array.isArray(centerLRAddition) && centerLRAddition.length > 0) {

      // centerとsideの差を計算
      function calculateCenterAdditions(
        threePart: ThreeParts,
        centerLRAddition: AdditionalLengthPerThreePart[]
      ): { centerAddFromLeft: number; centerAddFromRight: number } {
        if (threePart.shift.shiftX > 0) {
          // shiftX > 0 の場合
          const topElement = centerLRAddition.find((item) => item.topDividingLength > 0);
          const bottomElement = centerLRAddition.find((item) => item.bottomDividingLength > 0);
      
          if (topElement) {
            centerAddFromLeft = topElement.topDividingLength;
          }
      
          if (bottomElement) {
            centerAddFromRight = bottomElement.bottomDividingLength;
          }
        } else if (threePart.shift.shiftX < 0) {
          // shiftX < 0 の場合
          const bottomElement = centerLRAddition.find((item) => item.bottomDividingLength > 0);
          const topElement = centerLRAddition.find((item) => item.topDividingLength > 0);
      
          if (bottomElement) {
            centerAddFromLeft = bottomElement.bottomDividingLength;
          }
      
          if (topElement) {
            centerAddFromRight = topElement.topDividingLength;
          }
        } else if (threePart.shift.shiftY > 0) {
          // shiftY > 0 の場合
          const leftElement = centerLRAddition.find((item) => item.leftDividingLength > 0);
          const rightElement = centerLRAddition.find((item) => item.rightDividingLength > 0);
      
          if (leftElement) {
            centerAddFromLeft = leftElement.leftDividingLength;
          }
      
          if (rightElement) {
            centerAddFromRight = rightElement.rightDividingLength;
          }
        } else if (threePart.shift.shiftY < 0) {
          // shiftY < 0 の場合
          const rightElement = centerLRAddition.find((item) => item.rightDividingLength > 0);
          const leftElement = centerLRAddition.find((item) => item.leftDividingLength > 0);
      
          if (rightElement) {
            centerAddFromLeft = rightElement.rightDividingLength;
          }
      
          if (leftElement) {
            centerAddFromRight = leftElement.leftDividingLength;
          }
        }
      
        return { centerAddFromLeft, centerAddFromRight };
      }

      const lengthSideToCenter = calculateCenterAdditions(threePart, centerLRAddition)
      centerAddFromLeft = lengthSideToCenter.centerAddFromLeft;
      centerAddFromRight = lengthSideToCenter.centerAddFromRight;
    } else {
      // 予期しない戻り値の場合
      centerAddFromLeft = 0;
      centerAddFromRight = 0;
    }

    console.log("左右の追加", centerLRAddition, centerAddFromLeft,centerAddFromRight)

    const getLocalDivideForAllThreePart = (
      threeParts: ThreeParts[],
      globalDividePerLine: DividingLengthPerLines[],
      polygon: Point[]
    ): AdditionalLengthPerThreePart[] => {
      
      const sideAdd: AdditionalLengthPerThreePart[] = threeParts.flatMap((threePart) =>
        additionalDividingPerThreePart(threePart, globalDividePerLine, globalDividePerSegments, polygon)
      );
      return sideAdd;
    };

    const CP: CreasePattern[] = []

    if (threePart.leftPart.length > 1) {
      const leftThreeParts = getNextThreePartsFromSide(threePart.leftPart, threePart.shift);
      const leftAdd = sideAdd[0]
      console.log("leftのAdd", leftAdd)
      
      const lefThreePartsOnlyCenter = getNextThreePartOnlyCenter(leftThreeParts);
      const leftUniqueDividePerSegment = getLocalDividingLength(lefThreePartsOnlyCenter, polygon);
      const processedLeftUniqueDividePerSegments = processLocalDividingLength(leftUniqueDividePerSegment);
      const leftUniqueDividePerLine = convertToGlobalDividingLengthPerLines(processedLeftUniqueDividePerSegments);

      console.log("unique, add", leftUniqueDividePerLine, leftAdd)

      function generateLeftPartCP(
        leftPart: Point[],
        uniqueDivide: DividingLengthPerLines[],
        additionalDivide: AdditionalLengthPerThreePart[],
        additionalLeftLength: number,
      ): CreasePattern {
        const cpPoints: Point[] = []; // 折り線の点群を格納する配列
        let totalAddLength = 0; // 追加分の長さの累積
        let totalUniqueLength = 0; // ユニークな分割線の長さの累積
        let totalDistanceTraveled = 0; // 探索で進んだ距離の累積
      
        if (threePart.shift.shiftX > 0){
          // 初期点を追加
          cpPoints.push({
            x: leftPart[0].x,
            y: leftPart[0].y - additionalLeftLength,
          });
        
          // 探索処理
          while (totalDistanceTraveled < Math.abs(leftPart[leftPart.length - 1].x - leftPart[0].x)) {
            // 現在の探索点を計算
            const currentPoint = {
              x: leftPart[0].x + totalDistanceTraveled,
              y: leftPart[0].y - totalDistanceTraveled - additionalLeftLength,
            };
        
            // 探索点が uniqueDivide の元の line 上に乗っている場合
            const uniqueLine = uniqueDivide.find((line) =>
              line.line.direction === "x"
                ? Math.abs(currentPoint.x - line.line.number) < scale / 2
                : Math.abs(currentPoint.y - line.line.number) < scale / 2
            );
            if (uniqueLine) {
              totalUniqueLength += uniqueLine.length;
            }
        
            // 探索点が additionalDivide の元の line 上に乗っている場合
            const additionalLine = additionalDivide.find((line) =>
              line.line.direction === "x"
                ? Math.abs(currentPoint.x - line.line.number) < scale / 2
                : Math.abs(currentPoint.y - line.line.number) < scale / 2
            );
            if (additionalLine) {
              const additionalLengthSum =
                additionalLine.leftDividingLength +
                additionalLine.rightDividingLength +
                additionalLine.topDividingLength +
                additionalLine.bottomDividingLength;
        
              // additionalDivide の点を追加（処理前後）
              cpPoints.push({
                x: currentPoint.x + totalUniqueLength + totalAddLength,
                y: currentPoint.y - totalUniqueLength - additionalLeftLength,
              });
              totalAddLength += additionalLengthSum;
              cpPoints.push({
                x: currentPoint.x + totalUniqueLength + totalAddLength,
                y: currentPoint.y - totalUniqueLength - additionalLeftLength,
              });
            }
        
            // 探索点を進める
            totalDistanceTraveled += scale;
          }
        
          // 最後の点を追加
          cpPoints.push({
            x: leftPart[0].x + totalDistanceTraveled + totalUniqueLength + totalAddLength,
            y: leftPart[0].y - totalDistanceTraveled - totalUniqueLength - additionalLeftLength,
          });
        
          // 点群をポリライン化し、線分に分割
          const lineSegments: LineSegment[] = [];
          for (let i = 0; i < cpPoints.length - 1; i++) {
            lineSegments.push({
              start: cpPoints[i],
              end: cpPoints[i + 1],
            });
          }
        
          // ポリラインを scale / 2 ごとに区切り、交互に valleyfold と mountainfold に追加
          const creasePattern: CreasePattern = { mountainfold: [], valleyfold: [] };
          let isValley = true;
        
          for (let i = 0; i < lineSegments.length; i++) {
            const segment = lineSegments[i];
            const segmentLength = Math.sqrt(
              Math.pow(segment.end.x - segment.start.x, 2) + Math.pow(segment.end.y - segment.start.y, 2)
            );
        
            if (segmentLength > scale / 2) {
              // 分割が必要
              let remainingLength = segmentLength;
              let startPoint = segment.start;
        
              while (remainingLength > scale / 2) {
                const ratio = (scale / 2) / remainingLength;
                const nextPoint = {
                  x: startPoint.x + (segment.end.x - startPoint.x) * ratio,
                  y: startPoint.y + (segment.end.y - startPoint.y) * ratio,
                };
        
                const newSegment: LineSegment = { start: startPoint, end: nextPoint };
                if (isValley) {
                  creasePattern.valleyfold.push(newSegment);
                } else {
                  creasePattern.mountainfold.push(newSegment);
                }
                isValley = !isValley;
        
                remainingLength -= scale / 2;
                startPoint = nextPoint;
              }
        
              // 残りの線分を追加
              const remainingSegment: LineSegment = { start: startPoint, end: segment.end };
              if (isValley) {
                creasePattern.valleyfold.push(remainingSegment);
              } else {
                creasePattern.mountainfold.push(remainingSegment);
              }
            } else {
              // 分割不要
              if (isValley) {
                creasePattern.valleyfold.push(segment);
              } else {
                creasePattern.mountainfold.push(segment);
              }
              isValley = !isValley;
            }
          }
          return creasePattern;
        }

        if (threePart.shift.shiftX < 0){
          // 初期点を追加
          cpPoints.push({
            x: leftPart[0].x,
            y: leftPart[0].y + additionalLeftLength,
          });
        
          // 探索処理
          while (totalDistanceTraveled < Math.abs(leftPart[leftPart.length - 1].x - leftPart[0].x)) {
            // 現在の探索点を計算
            const currentPoint = {
              x: leftPart[0].x + totalDistanceTraveled,
              y: leftPart[0].y - totalDistanceTraveled - additionalLeftLength,
            };
        
            // 探索点が uniqueDivide の元の line 上に乗っている場合
            const uniqueLine = uniqueDivide.find((line) =>
              line.line.direction === "x"
                ? Math.abs(currentPoint.x - line.line.number) < scale / 2
                : Math.abs(currentPoint.y - line.line.number) < scale / 2
            );
            if (uniqueLine) {
              totalUniqueLength += uniqueLine.length;
            }
        
            // 探索点が additionalDivide の元の line 上に乗っている場合
            const additionalLine = additionalDivide.find((line) =>
              line.line.direction === "x"
                ? Math.abs(currentPoint.x - line.line.number) < scale / 2
                : Math.abs(currentPoint.y - line.line.number) < scale / 2
            );
            if (additionalLine) {
              const additionalLengthSum =
                additionalLine.leftDividingLength +
                additionalLine.rightDividingLength +
                additionalLine.topDividingLength +
                additionalLine.bottomDividingLength;
        
              // additionalDivide の点を追加（処理前後）
              cpPoints.push({
                x: currentPoint.x + totalUniqueLength + totalAddLength,
                y: currentPoint.y - totalUniqueLength - additionalLeftLength,
              });
              totalAddLength += additionalLengthSum;
              cpPoints.push({
                x: currentPoint.x + totalUniqueLength + totalAddLength,
                y: currentPoint.y - totalUniqueLength - additionalLeftLength,
              });
            }
        
            // 探索点を進める
            totalDistanceTraveled += scale;
          }
        
          // 最後の点を追加
          cpPoints.push({
            x: leftPart[0].x + totalDistanceTraveled + totalUniqueLength + totalAddLength,
            y: leftPart[0].y - totalDistanceTraveled - totalUniqueLength - additionalLeftLength,
          });
        
          // 点群をポリライン化し、線分に分割
          const lineSegments: LineSegment[] = [];
          for (let i = 0; i < cpPoints.length - 1; i++) {
            lineSegments.push({
              start: cpPoints[i],
              end: cpPoints[i + 1],
            });
          }
        
          // ポリラインを scale / 2 ごとに区切り、交互に valleyfold と mountainfold に追加
          const creasePattern: CreasePattern = { mountainfold: [], valleyfold: [] };
          let isValley = true;
        
          for (let i = 0; i < lineSegments.length; i++) {
            const segment = lineSegments[i];
            const segmentLength = Math.sqrt(
              Math.pow(segment.end.x - segment.start.x, 2) + Math.pow(segment.end.y - segment.start.y, 2)
            );
        
            if (segmentLength > scale / 2) {
              // 分割が必要
              let remainingLength = segmentLength;
              let startPoint = segment.start;
        
              while (remainingLength > scale / 2) {
                const ratio = (scale / 2) / remainingLength;
                const nextPoint = {
                  x: startPoint.x + (segment.end.x - startPoint.x) * ratio,
                  y: startPoint.y + (segment.end.y - startPoint.y) * ratio,
                };
        
                const newSegment: LineSegment = { start: startPoint, end: nextPoint };
                if (isValley) {
                  creasePattern.valleyfold.push(newSegment);
                } else {
                  creasePattern.mountainfold.push(newSegment);
                }
                isValley = !isValley;
        
                remainingLength -= scale / 2;
                startPoint = nextPoint;
              }
        
              // 残りの線分を追加
              const remainingSegment: LineSegment = { start: startPoint, end: segment.end };
              if (isValley) {
                creasePattern.valleyfold.push(remainingSegment);
              } else {
                creasePattern.mountainfold.push(remainingSegment);
              }
            } else {
              // 分割不要
              if (isValley) {
                creasePattern.valleyfold.push(segment);
              } else {
                creasePattern.mountainfold.push(segment);
              }
              isValley = !isValley;
            }
          }
          return creasePattern;
        }

        if (threePart.shift.shiftX > 0){
          // 初期点を追加
          cpPoints.push({
            x: leftPart[0].x,
            y: leftPart[0].y - additionalLeftLength,
          });
        
          // 探索処理
          while (totalDistanceTraveled < Math.abs(leftPart[leftPart.length - 1].x - leftPart[0].x)) {
            // 現在の探索点を計算
            const currentPoint = {
              x: leftPart[0].x + totalDistanceTraveled,
              y: leftPart[0].y - totalDistanceTraveled - additionalLeftLength,
            };
        
            // 探索点が uniqueDivide の元の line 上に乗っている場合
            const uniqueLine = uniqueDivide.find((line) =>
              line.line.direction === "x"
                ? Math.abs(currentPoint.x - line.line.number) < scale / 2
                : Math.abs(currentPoint.y - line.line.number) < scale / 2
            );
            if (uniqueLine) {
              totalUniqueLength += uniqueLine.length;
            }
        
            // 探索点が additionalDivide の元の line 上に乗っている場合
            const additionalLine = additionalDivide.find((line) =>
              line.line.direction === "x"
                ? Math.abs(currentPoint.x - line.line.number) < scale / 2
                : Math.abs(currentPoint.y - line.line.number) < scale / 2
            );
            if (additionalLine) {
              const additionalLengthSum =
                additionalLine.leftDividingLength +
                additionalLine.rightDividingLength +
                additionalLine.topDividingLength +
                additionalLine.bottomDividingLength;
        
              // additionalDivide の点を追加（処理前後）
              cpPoints.push({
                x: currentPoint.x + totalUniqueLength + totalAddLength,
                y: currentPoint.y - totalUniqueLength - additionalLeftLength,
              });
              totalAddLength += additionalLengthSum;
              cpPoints.push({
                x: currentPoint.x + totalUniqueLength + totalAddLength,
                y: currentPoint.y - totalUniqueLength - additionalLeftLength,
              });
            }
        
            // 探索点を進める
            totalDistanceTraveled += scale;
          }
        
          // 最後の点を追加
          cpPoints.push({
            x: leftPart[0].x + totalDistanceTraveled + totalUniqueLength + totalAddLength,
            y: leftPart[0].y - totalDistanceTraveled - totalUniqueLength - additionalLeftLength,
          });
        
          // 点群をポリライン化し、線分に分割
          const lineSegments: LineSegment[] = [];
          for (let i = 0; i < cpPoints.length - 1; i++) {
            lineSegments.push({
              start: cpPoints[i],
              end: cpPoints[i + 1],
            });
          }
        
          // ポリラインを scale / 2 ごとに区切り、交互に valleyfold と mountainfold に追加
          const creasePattern: CreasePattern = { mountainfold: [], valleyfold: [] };
          let isValley = true;
        
          for (let i = 0; i < lineSegments.length; i++) {
            const segment = lineSegments[i];
            const segmentLength = Math.sqrt(
              Math.pow(segment.end.x - segment.start.x, 2) + Math.pow(segment.end.y - segment.start.y, 2)
            );
        
            if (segmentLength > scale / 2) {
              // 分割が必要
              let remainingLength = segmentLength;
              let startPoint = segment.start;
        
              while (remainingLength > scale / 2) {
                const ratio = (scale / 2) / remainingLength;
                const nextPoint = {
                  x: startPoint.x + (segment.end.x - startPoint.x) * ratio,
                  y: startPoint.y + (segment.end.y - startPoint.y) * ratio,
                };
        
                const newSegment: LineSegment = { start: startPoint, end: nextPoint };
                if (isValley) {
                  creasePattern.valleyfold.push(newSegment);
                } else {
                  creasePattern.mountainfold.push(newSegment);
                }
                isValley = !isValley;
        
                remainingLength -= scale / 2;
                startPoint = nextPoint;
              }
        
              // 残りの線分を追加
              const remainingSegment: LineSegment = { start: startPoint, end: segment.end };
              if (isValley) {
                creasePattern.valleyfold.push(remainingSegment);
              } else {
                creasePattern.mountainfold.push(remainingSegment);
              }
            } else {
              // 分割不要
              if (isValley) {
                creasePattern.valleyfold.push(segment);
              } else {
                creasePattern.mountainfold.push(segment);
              }
              isValley = !isValley;
            }
          }
          return creasePattern;
        }

        if (threePart.shift.shiftX > 0){
          // 初期点を追加
          cpPoints.push({
            x: leftPart[0].x,
            y: leftPart[0].y - additionalLeftLength,
          });
        
          // 探索処理
          while (totalDistanceTraveled < Math.abs(leftPart[leftPart.length - 1].x - leftPart[0].x)) {
            // 現在の探索点を計算
            const currentPoint = {
              x: leftPart[0].x + totalDistanceTraveled,
              y: leftPart[0].y - totalDistanceTraveled - additionalLeftLength,
            };
        
            // 探索点が uniqueDivide の元の line 上に乗っている場合
            const uniqueLine = uniqueDivide.find((line) =>
              line.line.direction === "x"
                ? Math.abs(currentPoint.x - line.line.number) < scale / 2
                : Math.abs(currentPoint.y - line.line.number) < scale / 2
            );
            if (uniqueLine) {
              totalUniqueLength += uniqueLine.length;
            }
        
            // 探索点が additionalDivide の元の line 上に乗っている場合
            const additionalLine = additionalDivide.find((line) =>
              line.line.direction === "x"
                ? Math.abs(currentPoint.x - line.line.number) < scale / 2
                : Math.abs(currentPoint.y - line.line.number) < scale / 2
            );
            if (additionalLine) {
              const additionalLengthSum =
                additionalLine.leftDividingLength +
                additionalLine.rightDividingLength +
                additionalLine.topDividingLength +
                additionalLine.bottomDividingLength;
        
              // additionalDivide の点を追加（処理前後）
              cpPoints.push({
                x: currentPoint.x + totalUniqueLength + totalAddLength,
                y: currentPoint.y - totalUniqueLength - additionalLeftLength,
              });
              totalAddLength += additionalLengthSum;
              cpPoints.push({
                x: currentPoint.x + totalUniqueLength + totalAddLength,
                y: currentPoint.y - totalUniqueLength - additionalLeftLength,
              });
            }
        
            // 探索点を進める
            totalDistanceTraveled += scale;
          }
        
          // 最後の点を追加
          cpPoints.push({
            x: leftPart[0].x + totalDistanceTraveled + totalUniqueLength + totalAddLength,
            y: leftPart[0].y - totalDistanceTraveled - totalUniqueLength - additionalLeftLength,
          });
        
          // 点群をポリライン化し、線分に分割
          const lineSegments: LineSegment[] = [];
          for (let i = 0; i < cpPoints.length - 1; i++) {
            lineSegments.push({
              start: cpPoints[i],
              end: cpPoints[i + 1],
            });
          }
        
          // ポリラインを scale / 2 ごとに区切り、交互に valleyfold と mountainfold に追加
          const creasePattern: CreasePattern = { mountainfold: [], valleyfold: [] };
          let isValley = true;
        
          for (let i = 0; i < lineSegments.length; i++) {
            const segment = lineSegments[i];
            const segmentLength = Math.sqrt(
              Math.pow(segment.end.x - segment.start.x, 2) + Math.pow(segment.end.y - segment.start.y, 2)
            );
        
            if (segmentLength > scale / 2) {
              // 分割が必要
              let remainingLength = segmentLength;
              let startPoint = segment.start;
        
              while (remainingLength > scale / 2) {
                const ratio = (scale / 2) / remainingLength;
                const nextPoint = {
                  x: startPoint.x + (segment.end.x - startPoint.x) * ratio,
                  y: startPoint.y + (segment.end.y - startPoint.y) * ratio,
                };
        
                const newSegment: LineSegment = { start: startPoint, end: nextPoint };
                if (isValley) {
                  creasePattern.valleyfold.push(newSegment);
                } else {
                  creasePattern.mountainfold.push(newSegment);
                }
                isValley = !isValley;
        
                remainingLength -= scale / 2;
                startPoint = nextPoint;
              }
        
              // 残りの線分を追加
              const remainingSegment: LineSegment = { start: startPoint, end: segment.end };
              if (isValley) {
                creasePattern.valleyfold.push(remainingSegment);
              } else {
                creasePattern.mountainfold.push(remainingSegment);
              }
            } else {
              // 分割不要
              if (isValley) {
                creasePattern.valleyfold.push(segment);
              } else {
                creasePattern.mountainfold.push(segment);
              }
              isValley = !isValley;
            }
          }
          return creasePattern;
        }
      }

      const leftCP = generateLeftPartCP(threePart.leftPart, leftUniqueDividePerLine, leftAdd, centerAddFromLeft)

      CP.push(leftCP)
    } 
    
    const threePartCP = mergeCreasePatterns(CP)
    return threePartCP
  }

  const generateSegmentsCreasePattern = (
    segments: DividingLengthPerSegments[],
    divide: DividingLengthPerLines[]
  ): CreasePattern => {
    const result: CreasePattern = { mountainfold: [], valleyfold: [] };
  
    segments.forEach((segment) => {
      if (segment.horizontalDividingLength > 0) {
        const shiftX = divide
          .filter((line) => line.line.direction === "x" && line.line.number < segment.line.start.x)
          .reduce((sum, line) => sum + line.length, 0);
  
        const startShiftY = divide
          .filter((line) => line.line.direction === "y" && line.line.number <= segment.line.start.y)
          .reduce((sum, line) => sum + line.length, 0);
  
        const endShiftY = divide
          .filter((line) => line.line.direction === "y" && line.line.number < segment.line.end.y)
          .reduce((sum, line) => sum + line.length, 0);
  
        // Shift the original segment
        const shiftedLine: LineSegment = {
          start: {
            x: segment.line.start.x + shiftX,
            y: segment.line.start.y + startShiftY,
          },
          end: {
            x: segment.line.end.x + shiftX,
            y: segment.line.end.y + endShiftY,
          },
        };
  
        // Generate mountainfolds along the shifted line
        const mountainCount = Math.floor(segment.horizontalDividingLength / 20);
        for (let i = 0; i < mountainCount - 1; i++) {
          const offset = scale * (i + 1);
  
          // Create a mountain fold parallel to the shifted line
          const mountainFold: LineSegment = {
            start: {
              x: shiftedLine.start.x + offset,
              y: shiftedLine.start.y,
            },
            end: {
              x: shiftedLine.end.x + offset,
              y: shiftedLine.end.y,
            },
          };
  
          result.mountainfold.push(mountainFold);
        }

        const standardValleyLine: LineSegment = {
          start: {
            x: shiftedLine.start.x + (scale / 2),
            y: shiftedLine.start.y,
          },
          end: {
            x: shiftedLine.end.x + (scale / 2),
            y: shiftedLine.end.y,
          },
        };

        const valleyCount = Math.floor(segment.horizontalDividingLength / 20);
        for (let i = 0; i < valleyCount; i++) {
          const offset = scale * i;
          const valleyFold: LineSegment = {
            start: {
              x: standardValleyLine.start.x + offset,
              y: standardValleyLine.start.y,
            },
            end: {
              x: standardValleyLine.end.x + offset,
              y: standardValleyLine.end.y,
            },
          };
  
          result.valleyfold.push(valleyFold);
        }
      }
  
      if (segment.verticalDividingLength > 0) {
        const shiftY = divide
          .filter((line) => line.line.direction === "y" && line.line.number < segment.line.start.y)
          .reduce((sum, line) => sum + line.length, 0);
  
        const startShiftX = divide
          .filter((line) => line.line.direction === "x" && line.line.number <= segment.line.start.x)
          .reduce((sum, line) => sum + line.length, 0);
  
        const endShiftX = divide
          .filter((line) => line.line.direction === "x" && line.line.number < segment.line.end.x)
          .reduce((sum, line) => sum + line.length, 0);
  
        // Shift the original segment
        const shiftedLine: LineSegment = {
          start: {
            x: segment.line.start.x + startShiftX,
            y: segment.line.start.y + shiftY,
          },
          end: {
            x: segment.line.end.x + endShiftX,
            y: segment.line.end.y + shiftY,
          },
        };
  
        // Generate valleyfolds along the shifted line
        const mauntainCount = Math.floor(segment.verticalDividingLength / 20);
        for (let i = 0; i < mauntainCount - 1; i++) {
          const offset = scale * (i + 1);

          const mauntainFold: LineSegment = {
            start: {
              x: shiftedLine.start.x,
              y: shiftedLine.start.y + offset,
            },
            end: {
              x: shiftedLine.end.x,
              y: shiftedLine.end.y + offset,
            },
          };
  
          result.mountainfold.push(mauntainFold);
        }

        const standardValleyLine: LineSegment = {
          start: {
            x: shiftedLine.start.x,
            y: shiftedLine.start.y + (scale / 2),
          },
          end: {
            x: shiftedLine.end.x,
            y: shiftedLine.end.y + (scale / 2),
          },
        };

        const valleyCount = Math.floor(segment.verticalDividingLength / 20);
        for (let i = 0; i < valleyCount; i++) {
          const offset = scale * i;
          const valleyFold: LineSegment = {
            start: {
              x: standardValleyLine.start.x,
              y: standardValleyLine.start.y + offset,
            },
            end: {
              x: standardValleyLine.end.x,
              y: standardValleyLine.end.y + offset,
            },
          };
  
          result.valleyfold.push(valleyFold);
        }
      }
    });
  
    return result;
  };

  const generatePaper = (
    boundingRectangle: Point[],
    dividePerLine: DividingLengthPerLines[]
  ): LineSegment[] => {
    // x方向とy方向の伸び幅を計算
    const stretchX = dividePerLine
      .filter(line => line.line.direction === "x")
      .reduce((sum, line) => sum + line.length, 0);
  
    const stretchY = dividePerLine
      .filter(line => line.line.direction === "y")
      .reduce((sum, line) => sum + line.length, 0);
  
    // 左下の頂点を固定し、boundingRectangleを引き伸ばす
    const bottomLeft = boundingRectangle[3]; // 左下
    const topLeft = boundingRectangle[0];    // 左上
    const topRight = boundingRectangle[1];  // 右上
    const bottomRight = boundingRectangle[2]; // 右下
  
    // 伸ばした後の各頂点を計算
    const newBottomRight: Point = {
      x: bottomRight.x + stretchX,
      y: bottomRight.y,
    };
  
    const newTopLeft: Point = {
      x: topLeft.x,
      y: topLeft.y + stretchY,
    };
  
    const newTopRight: Point = {
      x: topRight.x + stretchX,
      y: topRight.y + stretchY,
    };
  
    // LineSegment[] に各辺を追加
    const stretchedRectangle: LineSegment[] = [
      { start: bottomLeft, end: newBottomRight }, // 下辺
      { start: bottomLeft, end: newTopLeft },     // 左辺
      { start: newBottomRight, end: newTopRight }, // 右辺
      { start: newTopLeft, end: newTopRight },    // 上辺
    ];
  
    return stretchedRectangle;
  };

  function divideAndSeparatePolygon(
    points: Point[],
    dividingLines: DividingLengthPerLines[]
  ): Point[][] {
    const separatedPolygons: Point[][] = [];
  
    function getOffsetVector(line: OrthogonalLine, distance: number): { dx: number; dy: number } {
      // 離す操作をX軸またはY軸方向にのみ適用
      if (line.direction === "x") {
        return { dx: 0, dy: distance };
      } else if (line.direction === "y") {
        return { dx: distance, dy: 0 };
      }
      return { dx: 0, dy: 0 };
    }
  
    function isPointOnLine(point: Point, line: OrthogonalLine): boolean {
      if (line.direction === "x") {
        return Math.abs(point.y - line.number) < 1e-8;
      } else if (line.direction === "y") {
        return Math.abs(point.x - line.number) < 1e-8;
      }
      return false;
    }
  
    function cutPolygon(points: Point[], line: OrthogonalLine): Point[][] {
      const above: Point[] = [];
      const below: Point[] = [];
      const n = points.length;
  
      for (let i = 0; i < n; i++) {
        const current = points[i];
        const next = points[(i + 1) % n];
        const currentAbove = line.direction === "x" ? current.y > line.number : current.x > line.number;
        const nextAbove = line.direction === "x" ? next.y > line.number : next.x > line.number;
  
        if (currentAbove) above.push(current);
        else below.push(current);
  
        if (line.direction === "x" && current.y === next.y && current.y === line.number) {
          above.push(current);
          below.push(current);
        } else if (line.direction === "y" && current.x === next.x && current.x === line.number) {
          above.push(current);
          below.push(current);
        } else if (currentAbove !== nextAbove) {
          const t =
            line.direction === "x"
              ? (line.number - current.y) / (next.y - current.y)
              : (line.number - current.x) / (next.x - current.x);
  
          const intersection: Point = {
            x: current.x + t * (next.x - current.x),
            y: current.y + t * (next.y - current.y),
          };
  
          above.push(intersection);
          below.push(intersection);
        }
      }
  
      return [above, below];
    }
  
    let currentPolygons: Point[][] = [points];
    dividingLines.forEach((dividingLine) => {
      const newPolygons: Point[][] = [];
  
      currentPolygons.forEach((polygon) => {
        const [above, below] = cutPolygon(polygon, dividingLine.line);
        newPolygons.push(above, below);
      });
  
      currentPolygons = newPolygons;
    });
  
    currentPolygons.forEach((polygon, index) => {
      const offsetLine = dividingLines[index % dividingLines.length];
      const offsetVector = getOffsetVector(offsetLine.line, offsetLine.length);
  
      const translatedPolygon = polygon.map((point) => {
        // X軸またはY軸を基準に適切に離す
        if (offsetLine.line.direction === "x") {
          return {
            x: point.x,
            y: point.y + (point.y >= offsetLine.line.number ? offsetVector.dy : -offsetVector.dy),
          };
        } else if (offsetLine.line.direction === "y") {
          return {
            x: point.x + (point.x >= offsetLine.line.number ? offsetVector.dx : -offsetVector.dx),
            y: point.y,
          };
        }
        return point;
      });
  
      separatedPolygons.push(translatedPolygon);
    });
  
    return separatedPolygons;
  }

  const onCompute = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext("2d");
      if (context) {
        const processedPolygonPoints = processPoints(polygonPoints);
        const boundingRectangle = computeBoundingRectangle(processedPolygonPoints);
        const concaveParts = getConcaveParts(processedPolygonPoints);
        const allThreeParts = processConcaves(concaveParts);
        const local = getLocalDividingLength(allThreeParts, processedPolygonPoints);
        const processedDivide = processLocalDividingLength(local);
        const global = getGlobalDividingLength(processedDivide);
        const globalPerLine = convertToGlobalDividingLengthPerLines(global);
  
        const segmentCP: CreasePattern = generateSegmentsCreasePattern(global, globalPerLine);
        const threePartCP = generateThreePartCreasePattern(allThreeParts[1], globalPerLine, global, processedPolygonPoints);
        const resultCP = mergeCreasePatterns([segmentCP, threePartCP]);
        const paper = generatePaper(boundingRectangle, globalPerLine);
        const AdditionOneThreePart = additionalDividingPerThreePart(allThreeParts[1], globalPerLine, global, processedPolygonPoints);
        const dividingPolygon = divideAndSeparatePolygon(processedPolygonPoints, globalPerLine); // 分割された多角形を取得
  
        console.log("注目パート", allThreeParts[1]);
  
        // キャンバスのサイズ
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
  
        // 入力データの境界を計算
        const { minX, maxX, minY, maxY } = getMinMaxXY([
          ...processedPolygonPoints,
          ...resultCP.mountainfold.flatMap((line) => [line.start, line.end]),
          ...resultCP.valleyfold.flatMap((line) => [line.start, line.end]),
        ]);
  
        // スケールとオフセットを計算して描画範囲を調整
        const xScale = canvasWidth / (maxX - minX);
        const yScale = canvasHeight / (maxY - minY);
        const scale = Math.min(xScale, yScale) * 0.8; // 20%余白を確保
        const slideOffset = 100; // 下方向へのスライドオフセット
        const xOffset = -minX * scale;
        const yOffset = canvasHeight - (maxY - minY) * scale - slideOffset;
  
        const transformPoint = (point: Point): Point => ({
          x: point.x * scale + xOffset,
          y: canvasHeight - (point.y * scale + yOffset), // 上に行くほど y が大きくなるよう反転
        });
  
        const transformLineSegment = (line: LineSegment): LineSegment => ({
          start: transformPoint(line.start),
          end: transformPoint(line.end),
        });
  
        // キャンバスをクリア
        context.clearRect(0, 0, canvasWidth, canvasHeight);
  
        // 用いる紙を計算
        context.strokeStyle = "black";
        paper.forEach((line) => {
          const transformedLine = transformLineSegment(line);
          context.beginPath();
          context.moveTo(transformedLine.start.x, transformedLine.start.y);
          context.lineTo(transformedLine.end.x, transformedLine.end.y);
          context.stroke();
        });
  
        // Mountainfold（赤）を描画
        context.strokeStyle = "red";
        resultCP.mountainfold.forEach((line) => {
          const transformedLine = transformLineSegment(line);
          context.beginPath();
          context.moveTo(transformedLine.start.x, transformedLine.start.y);
          context.lineTo(transformedLine.end.x, transformedLine.end.y);
          context.stroke();
        });
  
        // Valleyfold（青）を描画
        context.strokeStyle = "blue";
        resultCP.valleyfold.forEach((line) => {
          const transformedLine = transformLineSegment(line);
          context.beginPath();
          context.moveTo(transformedLine.start.x, transformedLine.start.y);
          context.lineTo(transformedLine.end.x, transformedLine.end.y);
          context.stroke();
        });
  
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