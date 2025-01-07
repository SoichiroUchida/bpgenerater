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

interface SogoHaichi {
  originalPart: Point[]
  line: LineSegment;
  leftDividingLength: number;
  rightDividingLength: number;
  topDividingLength: number;
  bottomDividingLength: number;
  horizontalDividingLength: number;
  verticalDividingLength: number;
  collision: boolean;
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
  
  //連続する同じ点を解消する関数
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

  // ある点が点集合に含まれるかを判定する関数
  function isPointInSet(points: Point[], target: Point): boolean {
    return points.some(
      (p) => p.x === target.x && p.y === target.y
    );
  }

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

  // ポリラインの辺（両端を除く）に点が含まれるかを判定する関数。
  function isPointOnPolylineEdge(
    p: Point,
    polyline: Point[],
    eps = 1e-9
  ): boolean {
    // 辞書関数のように距離を計算
    const dist = (a: Point, b: Point) =>
      Math.hypot(b.x - a.x, b.y - a.y);
  
    // polyline が2点未満なら線分にならない
    if (polyline.length < 2) return false;
  
    for (let i = 0; i < polyline.length; i++) {
      const s = polyline[i];
      const e = polyline[(i + 1) % polyline.length];
  
      // s と e が同じ点ならスキップ
      const distSE = dist(s, e);
      if (distSE < eps) continue;
  
      // 端点と一致するなら「頂点扱い」→ falseに
      const distPS = dist(p, s);
      const distPE = dist(p, e);
      if (distPS < eps || distPE < eps) {
        // 頂点に一致
        continue;
      }
  
      // 線分上にあるか
      // (s->p)+(p->e)が(s->e)にほぼ等しければ線上
      if (Math.abs((distPS + distPE) - distSE) < eps) {
        return true;
      }
    }
    return false;
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
  const getHaichikyoriFromOneRectangle = (threePart: ThreeParts): DividingLength => {
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
    const dividingLenght = getHaichikyoriFromOneRectangle(threeParts)
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
          ? (segment.start.x === part[part.length - 1].x && segment.start.y === part[part.length - 1].y) || (segment.end.x === part[part.length - 1].x && segment.end.y === part[part.length - 1].y)
          : (segment.start.x === part[0].x && segment.start.y === part[0].y) || (segment.end.x === part[0].x && segment.end.y === part[0].y);
  
        results.push({
          originalPart: isMatchingPoint ? part : [{ x: 0, y: 0 }],
          line: segment,
          leftDividingLength: isMatchingPoint ? leftDividingLength : 0,
          rightDividingLength: isMatchingPoint ? rightDividingLength : 0,
          topDividingLength: isMatchingPoint ? topDividingLength : 0,
          bottomDividingLength: isMatchingPoint ? bottomDividingLength : 0,
          horizontalDividingLength: Math.max(leftDividingLength, rightDividingLength),
          verticalDividingLength: Math.max(topDividingLength, bottomDividingLength),
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
  const getLocalHaichi = (
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
  const processLocalHaichi = (
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
  
            if (endpointsMatch && part1.originalPart.length > 1 && part2.originalPart.length > 1) {
              // 組を統合
              function connectOriginalParts(part1: { originalPart: Point[] }, part2: { originalPart: Point[] }): Point[] {
                const part1Start = part1.originalPart[0];
                const part1End = part1.originalPart[part1.originalPart.length - 1];
                const part2Start = part2.originalPart[0];
                const part2End = part2.originalPart[part2.originalPart.length - 1];
            
                if (part1Start.x === part2End.x && part1Start.y === part2End.y) {
                    // part1Start と part2End が同一の点
                    return [...part2.originalPart, ...part1.originalPart.slice(1)];
                } else if (part1End.x === part2Start.x && part1End.y === part2Start.y) {
                    // part1End と part2Start が同一の点
                    return [...part1.originalPart, ...part2.originalPart.slice(1)];
                } else if (part1Start.x === part2Start.x && part1Start.y === part2Start.y) {
                    // part1Start と part2Start が同一の点
                    return [...part2.originalPart.reverse(), ...part1.originalPart.slice(1)];
                } else if (part1End.x === part2End.x && part1End.y === part2End.y) {
                    // part1End と part2End が同一の点
                    return [...part1.originalPart, ...part2.originalPart.reverse().slice(1)];
                } else {
                    throw new Error("No matching points found to connect the parts.");
                }
              }
              const merged: DividingLengthPerSegments = {
                originalPart: connectOriginalParts(part1, part2),// 結合した originalPart
                line: part1.line,
                leftDividingLength: part1.leftDividingLength + part2.leftDividingLength,
                rightDividingLength: part1.rightDividingLength + part2.rightDividingLength,
                topDividingLength: part1.topDividingLength + part2.topDividingLength,
                bottomDividingLength: part1.bottomDividingLength + part2.bottomDividingLength,
                horizontalDividingLength: part1.leftDividingLength + part2.leftDividingLength + part1.rightDividingLength + part2.rightDividingLength,
                verticalDividingLength: part1.topDividingLength + part2.topDividingLength + part1.bottomDividingLength + part2.bottomDividingLength,
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

  // 点の集合から特定の点を探し、その前後の点を含めた３点を取得する関数
  const findThreePoints = (points: Point[], target: Point): Point[] => {
    const index = points.findIndex((point) => point.x === target.x && point.y === target.y);
    if (index === -1) {
        console.error("The target point is not found in the given points.");
        throw new Error("The target point is not found in the given points.");
    }

    const n = points.length;
    const prev = points[(index - 1 + n) % n];
    const next = points[(index + 1) % n];

    return [prev, target, next];
};

  // DividingLengthPerSegments　がもつ必要条件の個数を数える関数
  function checkZeroCount(startHaichi: DividingLengthPerSegments): number {
    const zeroCount = [
      startHaichi.leftDividingLength,
      startHaichi.rightDividingLength,
      startHaichi.topDividingLength,
      startHaichi.bottomDividingLength,
    ].filter(val => val === 0).length;
    console.log("zeroCount:", zeroCount);
    return 4 - zeroCount;
  }
  
  // 局所的な離し方を統合して、大域的な離し方を計算する関数。
  const getSogoHaichi = (
    polygon: Point[],
    processLocalDividingLength: DividingLengthPerSegments[]
  ): SogoHaichi[] => {
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
    const results: SogoHaichi[] = [];
  
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
 
        // セグメントの端点を抜き出す
        const representativeSegment = exactGroup[0];
        const lineStart = representativeSegment.line.start;
        const lineEnd = representativeSegment.line.end;
    
        // lineの端点がoriginalPartのポリラインに乗っているようなDividingLengthPerSegmentsを取得する関数
        function pickStartEndHaichi(
          exactGroup: DividingLengthPerSegments[],
          lineStart: Point,
          lineEnd: Point
        ): {
          startHaichi: DividingLengthPerSegments[];
          endHaichi: DividingLengthPerSegments[];
        } {
          // originalPartに lineStart を含むもの
          const startHaichi = exactGroup.filter(item =>
            isPointOnPolyline(lineStart, item.originalPart)
          );
          
          const endHaichi = exactGroup.filter(item =>
            isPointOnPolyline(lineEnd, item.originalPart)
          );
          return { startHaichi, endHaichi };
        }

        const { startHaichi, endHaichi } = pickStartEndHaichi(exactGroup, lineStart, lineEnd);

        const isStartOnPolylineEdge = isPointOnPolylineEdge(lineStart, polygon);
        const isEndOnPolylineEdge = isPointOnPolylineEdge(lineEnd, polygon);
        let leftStart = 0;
        let rightStart = 0;
        let topStart = 0;
        let bottomStart = 0;
        let leftEnd = 0;
        let rightEnd = 0;
        let topEnd = 0;
        let bottomEnd = 0;
        
        // どの必要条件の影響もうけていないセグメントの端点に対する処理
        if (startHaichi.length === 0) {
          // 端点がポリラインの頂点に乗っている場合
          if (!isStartOnPolylineEdge) {
            const [prePoint, point, nextPoint] = findThreePoints(polygon, lineStart);
            const isLeftSide = isLeft(prePoint, lineEnd, lineStart) > 0|| isLeft(nextPoint, lineEnd, lineStart) > 0;
            const segmentDirection = getVectorDirection(lineEnd, lineStart);
            if (segmentDirection.shiftX > 0) {
              topStart = isLeftSide ? 0: maxVertical;
              bottomStart = isLeftSide ?   maxVertical: 0;
            } else if (segmentDirection.shiftX < 0) {
              topStart = isLeftSide ? maxVertical : 0;
              bottomStart = isLeftSide ? 0 : maxVertical;
            } else if (segmentDirection.shiftY > 0) {
              leftStart = isLeftSide ? 0: maxHorizontal;
              rightStart = isLeftSide ? maxHorizontal: 0;
            } else {
              rightStart = isLeftSide ? 0: maxHorizontal;
              leftStart = isLeftSide ?  maxHorizontal: 0;
            }
          }
        } else {
          if (checkZeroCount(startHaichi[0]) === 1) {
            leftStart = (startHaichi[0].leftDividingLength === 0) ? 0 : maxHorizontal;
            rightStart = (startHaichi[0].rightDividingLength === 0) ? 0 : maxHorizontal;
            topStart = (startHaichi[0].topDividingLength === 0) ? 0 : maxVertical;
            bottomStart = (startHaichi[0].bottomDividingLength === 0) ? 0 : maxVertical;
          } else {
            leftStart = startHaichi[0].leftDividingLength;
            rightStart = startHaichi[0].rightDividingLength;
            topStart = startHaichi[0].topDividingLength;
            bottomStart = startHaichi[0].bottomDividingLength;
          }
        }

        if (endHaichi.length === 0) {
          if (!isEndOnPolylineEdge) {
            const [prePoint, point, nextPoint] = findThreePoints(polygon, lineEnd);
            const isLeftSide = isLeft(prePoint, lineStart, lineEnd) > 0 || isLeft(nextPoint, lineStart, lineEnd) > 0;
            const segmentDirection = getVectorDirection(lineStart, lineEnd);
            if (segmentDirection.shiftX > 0) {
              topEnd = isLeftSide ? 0 : maxVertical;
              bottomEnd = isLeftSide ? maxVertical : 0;
            } else if (segmentDirection.shiftX < 0) {
              topEnd = isLeftSide ? maxVertical : 0;
              bottomEnd = isLeftSide ? 0 : maxVertical;
            } else if (segmentDirection.shiftY > 0) {
              leftEnd = isLeftSide ? 0 : maxHorizontal;
              rightEnd = isLeftSide ? maxHorizontal : 0;
            } else {
              rightEnd = isLeftSide ? 0 : maxHorizontal;
              leftEnd = isLeftSide ? maxHorizontal : 0;
            }
          } 
        } else {
          if (checkZeroCount(endHaichi[0]) === 1) {
            leftEnd = (endHaichi[0].leftDividingLength === 0) ? 0 : maxHorizontal;
            rightEnd = (endHaichi[0].rightDividingLength === 0) ? 0 : maxHorizontal;
            topEnd = (endHaichi[0].topDividingLength === 0) ? 0 : maxVertical;
            bottomEnd = (endHaichi[0].bottomDividingLength === 0) ? 0 : maxVertical;
          } else {
            leftEnd = endHaichi[0].leftDividingLength;
            rightEnd = endHaichi[0].rightDividingLength;
            topEnd = endHaichi[0].topDividingLength;
            bottomEnd = endHaichi[0].bottomDividingLength;
          }
        }

        // 衝突の判定
        const collision = (Math.max(rightStart, rightEnd) + Math.max(leftStart, leftEnd) + Math.max(topStart, topEnd) + Math.max(bottomStart, bottomEnd)) > (maxHorizontal + maxVertical);
    
        // 衝突の有無によって異なる処理を実行
        // 必要条件の合計値と配置距離を一致させつつ、衝突がない場合は衝突が発生しないように気を付ける。
        if (collision) {
          rightStart = maxHorizontal - leftStart;
          bottomStart = maxVertical - topStart;
          rightEnd = maxHorizontal - leftEnd;
          bottomEnd = maxVertical - topEnd;
        } else {
          if (maxVertical === 0) {
            const maxLeft = Math.max(leftStart, leftEnd);
            leftStart = maxLeft;
            leftEnd = maxLeft;
            rightStart = maxHorizontal - maxLeft;
            rightEnd = maxHorizontal - maxLeft;
          } else {
            const maxTop = Math.max(topStart, topEnd);
            topStart = maxTop;
            topEnd = maxTop;
            bottomStart = maxVertical - maxTop;
            bottomEnd = maxVertical - maxTop;
          }
        }
      
        // 統合結果を作成
        results.push({
            originalPart: [lineStart], 
            line: representativeSegment.line, // 同一グループのlineはすべて同じ
            leftDividingLength: leftStart,
            rightDividingLength: rightStart,
            topDividingLength: topStart,
            bottomDividingLength: bottomStart,
            horizontalDividingLength: maxHorizontal,
            verticalDividingLength: maxVertical,
            collision: collision
        });
    
        results.push({
            originalPart: [lineEnd], // 代表値
            line: representativeSegment.line, // 同一グループのlineはすべて同じ
            leftDividingLength: leftEnd,
            rightDividingLength: rightEnd,
            topDividingLength: topEnd,
            bottomDividingLength: bottomEnd,
            horizontalDividingLength: maxHorizontal,
            verticalDividingLength: maxVertical,
            collision: collision
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

  // Centerから派生したThreeParts のみを取得する関数
  function getNextThreePartOnlyCenter(threePart: ThreeParts): ThreeParts[] {
    const threePartsGroup: ThreeParts[] = [threePart];

    function nextThreePartsFromCenter(three: ThreeParts): void {
        const newParts: ThreeParts[] = [];

        if (three.centerPart.length >= 3) {
            const nextParts = getNextThreePartsFromCenter(three.centerPart, three.shift);
            newParts.push(...nextParts);
            threePartsGroup.push(...nextParts);
        }

        if (
            newParts.some(
                (part) =>
                    part.leftPart.length >= 3 ||
                    part.rightPart.length >= 3 ||
                    part.centerPart.length >= 3
            )
        ) {
            newParts.forEach(nextThreePartsFromCenter);
        }
    }

    nextThreePartsFromCenter(threePart);
    return threePartsGroup;
  }

  function getKihonRyoiki(threePart: ThreeParts): Point[] {
    const threePartsArray = getNextThreePartOnlyCenter(threePart);
    const parts = threePartsArray
      .flatMap(p => {
        const left = p.leftPart.length >= 3
          ? [p.leftPart[0], p.leftPart[p.leftPart.length - 1]]
          : p.leftPart;
        const right = p.rightPart.length >= 3
          ? [p.rightPart[0], p.rightPart[p.rightPart.length - 1]]
          : p.rightPart;
        return [left, right];
      })
      .filter(x => x.length > 1);
  
    // パーツ（行）の一覧を出力
    console.group("パーツ情報 (parts)");
    console.groupEnd();
  
    const shiftX = threePart.shift.shiftX;
    const shiftY = threePart.shift.shiftY;
    const orderedLines: Point[][] = [];
  
    /**
     * ログ出力関数 (デバッグ用)
     */
    const printCandidates = (
      candidate: { line: Point[]; key: number }[],
      sortedKeyName: string
    ) => {
      console.group(`候補 (sorted by ${sortedKeyName})`);
      candidate.forEach((c, i) => {
      });
      console.groupEnd();
    };
  
    if (shiftY > 0) {
      // 上方向へのシフトの場合
      const sx = threePart.leftPart[0].x;
      const sy = threePart.leftPart[0].y;
  
      // 開始行を取得
      let startLine = parts.find(line =>
        line.some(pt => pt.x === sx && pt.y === sy)
      );
      if (!startLine) {
        return [];
      }
  
      orderedLines.push(startLine);
      let usedIdx = startLine.findIndex(pt => pt.x === sx && pt.y === sy);
      let remain = startLine[1 - usedIdx];
  
      let iterationCount = 0;
      while (true) {
        iterationCount++;
        const sameY = remain.y;
  
        console.group(`=== Iteration #${iterationCount} ===`);
  
        // 次に選択する候補をフィルタリング
        const candidate = parts
          .filter(l => !orderedLines.includes(l))
          .map(l => {
            const [pA, pB] = l;
            let minX = Infinity;
            if (pA.y === sameY && pA.x < minX) minX = pA.x;
            if (pB.y === sameY && pB.x < minX) minX = pB.x;
            return { line: l, key: minX };
          })
          .filter(o => o.key < Infinity)
          .sort((a, b) => a.key - b.key);
  
        // 候補の表示
        printCandidates(candidate, "minX");
  
        if (!candidate.length) {
          console.groupEnd();
          break;
        }
  
        // 最もminXが小さい行を採用
        const nextLine = candidate[0].line;
        orderedLines.push(nextLine);

        // remainを更新
        if (nextLine[0].y === remain.y) {
          remain = nextLine[1];
        } else {
          remain = nextLine[0];
        }
        console.groupEnd();
      }
  
    } else if (shiftY < 0) {
      // 下方向へのシフトの場合
      const sx = threePart.leftPart[0].x;
      const sy = threePart.leftPart[0].y;
  
      let startLine = parts.find(line =>
        line.some(pt => pt.x === sx && pt.y === sy)
      );
      if (!startLine) {
        return [];
      }
  
      orderedLines.push(startLine);
      let usedIdx = startLine.findIndex(pt => pt.x === sx && pt.y === sy);
      let remain = startLine[1 - usedIdx];
  
      let iterationCount = 0;
      while (true) {
        iterationCount++;
        const sameY = remain.y;
  
        console.group(`=== Iteration #${iterationCount} ===`);
  
        const candidate = parts
          .filter(l => !orderedLines.includes(l))
          .map(l => {
            const [pA, pB] = l;
            let maxX = -Infinity;
            if (pA.y === sameY && pA.x > maxX) maxX = pA.x;
            if (pB.y === sameY && pB.x > maxX) maxX = pB.x;
            return { line: l, key: maxX };
          })
          .filter(o => o.key > -Infinity)
          .sort((a, b) => b.key - a.key); // x座標が大きい順
  
        printCandidates(candidate, "maxX");
  
        if (!candidate.length) {
          console.groupEnd();
          break;
        }
  
        const nextLine = candidate[0].line;
        orderedLines.push(nextLine);

        if (nextLine[0].y === remain.y) {
          remain = nextLine[1];
        } else {
          remain = nextLine[0];
        }
        console.groupEnd();
      }
  
    } else if (shiftX > 0) {
      // 下方向へのシフトの場合（元コードで x<->y を入れ替え）
      const sy = threePart.leftPart[0].y;
      const sx = threePart.leftPart[0].x;

      // 「startLine」を探す際も (x, y) を (y, x) に読み替え
      let startLine = parts.find(line =>
        line.some(pt => pt.y === sy && pt.x === sx)
      );
      if (!startLine) {

        return [];
      }

      // 選択した線分を記録
      orderedLines.push(startLine);

      // 「(sx, sy) と一致する点」のインデックスを求め、もう一方を `remain` とする
      let usedIdx = startLine.findIndex(pt => pt.y === sy && pt.x === sx);
      let remain = startLine[1 - usedIdx];

      let iterationCount = 0;
      while (true) {
        iterationCount++;
        
        // ここでは「同じ x 座標をもつ点」を探す形に
        const sameX = remain.x;

        console.group(`=== Iteration #${iterationCount} ===`);

        // candidateを求める際も “y座標” の扱いを “x座標” に読み替え
        // ここでは「pA.x === sameX のとき、y の最大値を key として格納」する例
        const candidate = parts
          .filter(l => !orderedLines.includes(l))
          .map(l => {
            const [pA, pB] = l;
            let maxY = -Infinity;
            if (pA.x === sameX && pA.y > maxY) maxY = pA.y;
            if (pB.x === sameX && pB.y > maxY) maxY = pB.y;
            return { line: l, key: maxY };
          })
          .filter(o => o.key > -Infinity)
          .sort((a, b) => b.key - a.key); // y座標が大きい順

        printCandidates(candidate, "maxY");

        if (!candidate.length) {
          console.groupEnd();
          break;
        }

        // 最も y 座標 (key) が大きい行を次の行として選択
        const nextLine = candidate[0].line;
        orderedLines.push(nextLine);

        // remainの更新も (x, y) を入れ替えたロジックに
        if (nextLine[0].x === remain.x) {
          remain = nextLine[1];
        } else {
          remain = nextLine[0];
        }

        console.groupEnd();
      }

    } else if (shiftX < 0) {
      // 上方向へのシフトの場合（x <-> y をすべて入れ替えた例）
      const sy = threePart.leftPart[0].y;  // もとのsxの位置にyを代入
      const sx = threePart.leftPart[0].x;  // もとのsyの位置にxを代入

      // 開始行を取得: "pt.y === sy && pt.x === sx" に書き換え
      let startLine = parts.find(line =>
        line.some(pt => pt.y === sy && pt.x === sx)
      );
      if (!startLine) {

        return [];
      }

      // 選択した線分を orderedLines にプッシュ
      orderedLines.push(startLine);

      // 「(sx, sy) と一致する点」のインデックスを探し、もう一方を remain にする
      let usedIdx = startLine.findIndex(pt => pt.y === sy && pt.x === sx);
      let remain = startLine[1 - usedIdx];

      let iterationCount = 0;
      while (true) {
        iterationCount++;

        // 今回は「同じ x 座標をもつ点」に注目するので、remain.x を基準とする
        const sameX = remain.x;

        console.group(`=== Iteration #${iterationCount} ===`);

        // 次に選択する候補をフィルタリング
        //   もともと minX を探していた部分を minY に変更し、
        //   「pA.x === sameX」のときに pA.y の最小値を取得する形へ
        const candidate = parts
          .filter(l => !orderedLines.includes(l))
          .map(l => {
            const [pA, pB] = l;
            let minY = Infinity;
            // pA.x が sameX と一致し、かつ pA.y < minY なら minY を更新
            if (pA.x === sameX && pA.y < minY) {
              minY = pA.y;
            }
            // pB についても同様
            if (pB.x === sameX && pB.y < minY) {
              minY = pB.y;
            }
            return { line: l, key: minY };
          })
          // 「minY が更新されなかった (Infinity のまま)」ものは除外
          .filter(o => o.key < Infinity)
          // minY の小さい順に並び替え
          .sort((a, b) => a.key - b.key);

        // 候補の表示
        printCandidates(candidate, "minY");

        if (!candidate.length) {
          console.groupEnd();
          break;
        }

        // 最も minY が小さい線分を採用
        const nextLine = candidate[0].line;
        orderedLines.push(nextLine);
        // remainを更新（もともと y === remain.y の判定を x === remain.x に変更）
        if (nextLine[0].x === remain.x) {
          remain = nextLine[1];
        } else {
          remain = nextLine[0];
        }
        console.groupEnd();
      }
    }

    const orderedParts: Point[] = [];

    // 1. ループを使う場合
    for (const segment of orderedLines) {
      // segment は [pA, pB] という形の2点配列
      orderedParts.push(...segment);
    }
  
    return orderedParts.filter((p, i, s) =>
      i === 0 || p.x !== s[i - 1].x || p.y !== s[i - 1].y
    );
  }

  // １つのThreePartに対して固有配置を計算する関数
  const getKoyuHaichi = (threePart: ThreeParts): DividingLengthPerSegments => {
    const allThreePart = getNextThreePartOnlyCenter(threePart);
    

    return
  }

  // １つのThreePartの入口の余分な段折りを計算する関数
  const getExtraDanori = (threePart: ThreeParts, sogoHaichi: SogoHaichi[]): Boolean => {
    return ;
  };

  // １つのThreePartの、入口を含むすべての余分な段折りを計算する関数

  // 複数の折り線集合を１つにまとめる関数。
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

  const generateThreePartsCreasePattern = (
    threeParts: ThreeParts[],
    divide: DividingLengthPerLines[]
  ): CreasePattern => {
    return 
  }


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

  const onCompute = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext("2d");
      if (context) {
        const processedPolygonPoints = processPoints(polygonPoints);
        const boundingRectangle = computeBoundingRectangle(processedPolygonPoints);
        const concaveParts = getConcaveParts(processedPolygonPoints);
        const allThreeParts = processConcaves(concaveParts);
        const localHaichi = getLocalHaichi(allThreeParts, processedPolygonPoints);
        const processedLocalHaichi = processLocalHaichi(localHaichi);
        const sogoHaichi = getSogoHaichi(processedPolygonPoints, processedLocalHaichi);
        const sogoHaichiPerLine = convertToGlobalDividingLengthPerLines(sogoHaichi);
  
        const segmentCP: CreasePattern = generateSegmentsCreasePattern(sogoHaichi, sogoHaichiPerLine);
        const resultCP = mergeCreasePatterns([segmentCP]);
        const paper = generatePaper(boundingRectangle, sogoHaichiPerLine);

        const oneThreePart = concaveToThreeParts(concaveParts[0]);
        const centerPartsOnly = getNextThreePartOnlyCenter(oneThreePart);
        const koyuHaichi = getLocalHaichi(centerPartsOnly, processedPolygonPoints);
        const kihonryoiki = getKihonRyoiki(oneThreePart);
  
        console.log("localHaichi, ,processedLocal, sogoHaichi, sogoHaichiPerLine, centerParts, koyuHaichi,kihonryoiki", localHaichi, processedLocalHaichi, sogoHaichi, sogoHaichiPerLine, centerPartsOnly, koyuHaichi, kihonryoiki);
  
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