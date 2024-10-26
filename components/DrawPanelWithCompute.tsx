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

interface TreeNode {
  rectangle: Point[];
  children: TreeNode[];
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points: concavePoints }) => {
  const [isComputed, setIsComputed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = 20;
  const epsilon = 1e-10;
  let maxIterations = 20;

  // ２つの点が一致するかを判定する関数。
  function arePointsEqual(p1: Point, p2: Point): boolean {
    return Math.abs(p1.x - p2.x) < epsilon && Math.abs(p1.y - p2.y) < epsilon;
  }

  //　ある点がある点集合の中に含まれているか判定する関数
  function isPointInPointSet(point: Point, pointSet: Point[]): boolean {
    return pointSet.some(p => arePointsEqual(p, point));
  }

  // 点が線分の両端に存在するか判定する関数
  const isPointOnEndpoints = (p: Point, a: Point, b: Point): boolean => {
    return (p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y);
  };

  // 3点が共線かどうかを判定する関数
  const isColinear = (a: Point, b: Point, c: Point): boolean =>
    Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < epsilon;

  // 区間が重なっているかを判定する関数（長さが正の重なり）
  const isOverlapping = (
    a1: number,
    a2: number,
    b1: number,
    b2: number
  ): boolean => {
    const [minA, maxA] = a1 < a2 ? [a1, a2] : [a2, a1];
    const [minB, maxB] = b1 < b2 ? [b1, b2] : [b2, b1];
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    return overlap > epsilon;
  };

  // 真ん中の値が両端の値の間に存在するかを判定する関数。
  // 点が一致する場合は順番が正しくないと判定する。
  const isBetween = (a: number, b: number, c: number) =>
    (a < b && b < c) || (c < b && b < a);

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

  // ２点のうち、多角形に含まれるほうを返す関数
  function selectValidPoint(point1: Point, point2: Point, concavePoints: Point[]): Point {
    const isPoint1Valid = isPointInsideOrPartialPolygon(point1, concavePoints);
    const isPoint2Valid = isPointInsideOrPartialPolygon(point2, concavePoints);
  
    if (isPoint1Valid && !isPoint2Valid) {
      return point1;
    } else if (!isPoint1Valid && isPoint2Valid) {
      return point2;
    } else {
      throw new Error('入力された2つの点のうち、一方のみが isPoint 関数で true を返す必要があります。');
    }
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

  // （メイン関数１）凹み部分を計算する
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

  // 近い点と遠い点を判定する
  function getNearestAndFarthestPoint(p: Point, a: Point, b: Point): { near: Point; far: Point } {
    // 距離を計算する関数
    function distance(point1: Point, point2: Point): number {
      const dx = point1.x - point2.x;
      const dy = point1.y - point2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // pからa、bまでの距離を計算
    const distanceA = distance(p, a);
    const distanceB = distance(p, b);

    // 比較してnearとfarを決定
    if (distanceA < distanceB) {
      return { near: a, far: b };
    } else if (distanceB < distanceA) {
      return { near: b, far: a };
    } else {
      // 距離が等しい場合はaをnear、bをfarとする
      return { near: a, far: b };
    }
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

  // 非平行型の凹みの分類関数
  function getTypeOfConcave(firstPoint: Point, lastPoint: Point, nextPoint: Point): boolean {
    if (isBetween(nextPoint.x, firstPoint.x, lastPoint.x) || isBetween(nextPoint.y, firstPoint.x, lastPoint.y)) {
      return true;
    } else {
      return false;
    }
  }

  // 内接長方形の探索の終了判定（幅のある平行型）
  // ２つの線分が長さ正の共通部分を持つかを判定する。
  function areLineSegmentsOverlapping(
    p1: Point,
    p2: Point,
    q1: Point,
    q2: Point
  ): boolean {
    // まず、4点が共線かどうかを確認
    if (isColinear(p1, p2, q1) && isColinear(p1, p2, q2)) {
      // 線分が水平か垂直かを判定
      if (Math.abs(p1.x - p2.x) < epsilon) {
        // 垂直線分の場合は y軸方向のみ確認
        return isOverlapping(p1.y, p2.y, q1.y, q2.y);
      } else if (Math.abs(p1.y - p2.y) < epsilon) {
        // 水平線分の場合は x軸方向のみ確認
        return isOverlapping(p1.x, p2.x, q1.x, q2.x);
      } else {
        // 斜めの線分の場合は両方の軸で確認
        const overlapX = isOverlapping(p1.x, p2.x, q1.x, q2.x);
        const overlapY = isOverlapping(p1.y, p2.y, q1.y, q2.y);
        return overlapX && overlapY;
      }
    }
    return false;
  }
  
  // 内接長方形の探索の終了判定（幅のない平行型）
  // ２本の線分が両端を除く点で交差するかを判定する関数。
  const doLinesInternalIntersect = (
    pointA: Point,
    pointB: Point,
    start: Point,
    end: Point
  ): boolean => {

    if (start.x === end.x) {
      return isBetween(pointA.x, start.x, pointB.x) && isBetween(start.y, pointA.y, end.y);
    } else {
      return isBetween(pointA.y, start.y, pointB.y) && isBetween(start.x, pointA.x, end.x);
    }
  };

  // １つの凹みに対する内接長方形の計算
  const computeInnerRectangle = (concavePoints: Point[]): Point[] => {

    const firstPoint = concavePoints[0];
    const lastPoint = concavePoints[concavePoints.length - 1];
    const nextPoint = concavePoints[1];

    let firstShiftX = 0;
    let firstShiftY = 0;

    // 進行方向の計算
    if (firstPoint.y === nextPoint.y)
      firstShiftX = firstPoint.x < nextPoint.x ? scale : -1 * scale;
    else firstShiftY = firstPoint.y < nextPoint.y ? scale : -1 * scale;

    // 入口平行型と非平行で場合分け
    if (firstPoint.x === lastPoint.x || firstPoint.y === lastPoint.y) {

      // 入口平行型の凹みに対するアルゴリズム
      const movedFirstPoint: Point = { x: firstPoint.x + firstShiftX, y: firstPoint.y + firstShiftY };
      const movedLastPoint: Point = { x: lastPoint.x + firstShiftX, y: lastPoint.y + firstShiftY };
      
      // 最初と最後の点が一致する場合
      if (firstPoint.x === lastPoint.x && firstPoint.y === lastPoint.y) {

        let tempMovedFirstPoint = { ...movedFirstPoint };

        while (isPointInsideOrPartialPolygon(tempMovedFirstPoint, concavePoints)) {
          tempMovedFirstPoint = {
            x: tempMovedFirstPoint.x + (0.5 * firstShiftX),
            y: tempMovedFirstPoint.y + (0.5 * firstShiftY),
          };
        }

        tempMovedFirstPoint = {
          x: tempMovedFirstPoint.x - (0.5 * firstShiftX),
          y: tempMovedFirstPoint.y - (0.5 * firstShiftY),
        };

        return [
          firstPoint, 
          tempMovedFirstPoint, 
          tempMovedFirstPoint,
          firstPoint
        ];
      } else {

        // 幅がある平行型
        let intersectionFound = false;
        let tempMovedFirstPoint = { ...movedFirstPoint };
        let tempMovedLastPoint = { ...movedLastPoint };

        let iterationCount = 0;
        while (!intersectionFound) {
          iterationCount++;

          if (iterationCount > maxIterations) {
            console.error('エラー: （平行型）反復回数が多すぎます。');
            break;
          }

          for (let i = 0; i < concavePoints.length; i++) {
            const start = concavePoints[i];
            const end = concavePoints[(i + 1) % concavePoints.length];

            if (areLineSegmentsOverlapping(tempMovedLastPoint, tempMovedFirstPoint, start, end)) {
              intersectionFound = true;
              break;
            }
          }

          // 交差が見つかっていない場合は、ポイントを更新
          if (!intersectionFound) {
            tempMovedFirstPoint = {
              x: tempMovedFirstPoint.x + firstShiftX,
              y: tempMovedFirstPoint.y + firstShiftY,
            };
            tempMovedLastPoint = {
              x: tempMovedLastPoint.x + firstShiftX,
              y: tempMovedLastPoint.y + firstShiftY,
            };
          }
        }
        return [
          firstPoint, 
          tempMovedFirstPoint, 
          tempMovedLastPoint,
          lastPoint
        ];
      }
    } else {
      // 入口非平行型
      const movedFirstPoint: Point = { x: firstPoint.x, y: firstPoint.y };
      const movedLastPoint: Point = { x: lastPoint.x, y: lastPoint.y };


      if (firstShiftX == 0) {
        movedLastPoint.y = firstPoint.y;
      } else {
        movedLastPoint.x = firstPoint.x;
      }

      let intersectionFound = false;
      let tempMovedFirstPoint = { ...movedFirstPoint };
      let tempMovedLastPoint = { ...movedLastPoint };

      let iterationCount = 0;
      while (!intersectionFound) {
        iterationCount++;

        if (iterationCount > maxIterations) {
          console.error('エラー: （非平行型）反復回数が多すぎます。');
          break;
        }

        for (let i = 0; i < concavePoints.length; i++) {
          const start = concavePoints[i];
          const end = concavePoints[(i + 1) % concavePoints.length];

          if (areLineSegmentsOverlapping(tempMovedLastPoint, tempMovedFirstPoint, start, end)) {
            intersectionFound = true;
            break;
          }
        }

        // 交差が見つかっていない場合は、ポイントを更新
        if (!intersectionFound) {
          tempMovedFirstPoint = {
            x: tempMovedFirstPoint.x + firstShiftX,
            y: tempMovedFirstPoint.y + firstShiftY,
          };
          tempMovedLastPoint = {
            x: tempMovedLastPoint.x + firstShiftX,
            y: tempMovedLastPoint.y + firstShiftY,
          };
        }
      }
      return [
        movedFirstPoint, 
        tempMovedFirstPoint, 
        tempMovedLastPoint,
        movedLastPoint
      ];
    }
  };

  // 入口が広がっている非平行型に対する、凹みの分割関数。
  function concaveSegmentation(concavePoints: Point[], shiftX: number, shiftY: number): [Point[], Point[]] {

    let movingPoint = { ...concavePoints[0] };
    movingPoint.x += shiftX;
    movingPoint.y += shiftY;
    
    let iterationCount = 0;

    while (true) {

      iterationCount++;
      if (iterationCount > maxIterations) {
        console.error('エラー: （平行型）反復回数が多すぎます。');
        break;
      }

      for (let i = 0; i < concavePoints.length; i++) {
        const start = concavePoints[i];
        const end = concavePoints[(i + 1) % concavePoints.length]; // 多角形の最後の辺も考慮
  
        if (isPointOnLineSegment(movingPoint, start, end)) {

          // 該当する辺上に movingPoint を挿入
          const insertIndex = (i + 1) % concavePoints.length;
          const newPoints = [...concavePoints];
          newPoints.splice(insertIndex, 0, movingPoint);
  
          // movingPoint で集合を分割
          const firstPart = newPoints.slice(0, insertIndex + 1);
          const secondPart = newPoints.slice(insertIndex);

          const crossPoint1 = {x: concavePoints[0].x, y: concavePoints[concavePoints.length - 1].y};
          const crossPoint2 = {x: concavePoints[concavePoints.length - 1].x, y: concavePoints[0].y};

          const conectedFirstPart = removeConsecutiveDuplicatePoints(firstPart);
          const conectedSecondPart = removeConsecutiveDuplicatePoints(secondPart);

          const crossPoint = selectValidPoint(crossPoint1, crossPoint2, concavePoints);

          const concaveDirection = getVectorDirection(conectedFirstPart[0], conectedFirstPart[1])

          if (concaveDirection[0] === shiftX) {
            conectedFirstPart.push(crossPoint)
          } else {
            conectedSecondPart.unshift(crossPoint)
          }
          return [conectedFirstPart, conectedSecondPart];
        }
  
      }
      // movingPoint をシフト
      movingPoint.x += shiftX;
      movingPoint.y += shiftY;
    }
  }

  // concaveSegmentationを各集合に適用する関数。
  // 点の集合の集合に対して、concaveSegmentationが必要な集合を見つけ、concaveSegmentationを適用する。
  function processConcave(beforeConcaves: Point[][], shiftX: number, shiftY:number): Point[][] {
    const afterConcaves: Point[][] = [];
    beforeConcaves.forEach((concave) => {
      const firstPoint = concave[0];
      const nextPoint = concave[1];
      const lastPoint = concave[concave.length - 1];
      console.log('type', getTypeOfConcave(firstPoint, lastPoint, nextPoint));

      if (firstPoint.x !== lastPoint.x && firstPoint.y !== lastPoint.y && getTypeOfConcave(firstPoint, lastPoint, nextPoint)) {
        
        const [newConcave1, newConcave2] = concaveSegmentation(concave, shiftX, shiftY);
        afterConcaves.push(newConcave1, newConcave2);
      } else {
        afterConcaves.push(concave);
      }
    })

    return afterConcaves;
  }

  // 凹部分の分割関数
  // 内接長方形をもとに1つの凹み部分を複数の凹み部分に分割
  function splitConcaveShape(concave: Point[], rectangle: Point[]): Point[][] {
    const result: Point[][] = [];
    let currentSet: Point[] | null = null;

    const firstPoint = concave[0];
    const adjacentFirstPoint = concave[1];
    let shiftX = 0;
    let shiftY = 0;

    // 進行方向の計算
    if (firstPoint.y === adjacentFirstPoint.y)
      shiftX = firstPoint.x < adjacentFirstPoint.x ? scale : -1 * scale;
    else shiftY = firstPoint.y < adjacentFirstPoint.y ? scale : -1 * scale;

    for (let i = 0; i < concave.length - 1; i++) {
      let start = concave[i];
      let end = concave[i + 1];

      const startOnEdge = isPointPartialPolygon(start, rectangle);
      const endOnEdge = isPointPartialPolygon(end, rectangle);

      if (startOnEdge && !endOnEdge) {
        currentSet = [];
        result.push(currentSet);
        if (isPointOnLineSegment(rectangle[1], start, end) && !isPointOnEndpoints(rectangle[1], start, end)) {
          start = rectangle[1];
        }
        if (isPointOnLineSegment(rectangle[2], start, end) && !isPointOnEndpoints(rectangle[2], start, end)) {
          start = rectangle[2];
        }
        currentSet.push(start);
        currentSet.push(end);

      } else if (!startOnEdge && endOnEdge) {
        if (isPointOnLineSegment(rectangle[1], start, end) && !isPointOnEndpoints(rectangle[1], start, end)) {
          end = rectangle[1];
        }
        if (isPointOnLineSegment(rectangle[2], start, end) && !isPointOnEndpoints(rectangle[2], start, end)) {
          end = rectangle[2];
        }
        if (currentSet) {
          currentSet.push(start);
          currentSet.push(end);
        }

      } else if (!startOnEdge && !endOnEdge) {
        if (!currentSet) {
          currentSet = [];
          result.push(currentSet);
        }
        if (currentSet) {
          if (
            isPointOnLineSegment(rectangle[1], start, end) &&
            !isPointOnEndpoints(rectangle[1], start, end) &&
            isPointOnLineSegment(rectangle[2], start, end) &&
            !isPointOnEndpoints(rectangle[2], start, end)
          ) {
            const nearFarPoints = getNearestAndFarthestPoint(start, rectangle[1], rectangle[2]);
            currentSet.push(start);
            currentSet.push(nearFarPoints.near);
            currentSet = [];
            result.push(currentSet);
            currentSet.push(nearFarPoints.far);
            currentSet.push(end);
          } else {
            currentSet.push(start);
            currentSet.push(end);
          }
        }
      } else {
        // 両方とも辺上に存在する場合、currentSetをnullにする
        currentSet = null;
      }
    }

    // 各集合内で隣接する点をつなぐ（重複を避ける）
    const conectedlResult: Point[][] = result.map((set) => {
      const simplifiedSet: Point[] = [];
      for (let i = 0; i < set.length; i++) {
        const point = set[i];
        if (i === 0 || point.x !== set[i - 1].x || point.y !== set[i - 1].y) {
          simplifiedSet.push(point);
        }
      }
      return simplifiedSet;
    });

    // 入口非平行型に対して、凹みを２分割する。
    const finalResult = processConcave(conectedlResult, shiftX, shiftY);

    return finalResult;
  }

  // 再帰的に内接長方形を構築
  function buildTreeNodeRecursive(points: Point[]): TreeNode {
    // 点の集合が4点以下の場合、再帰を終了
    if (points.length <= 4) {
      const rectangle = computeInnerRectangle(points);
      return { rectangle, children: [] };
    }

    // 内接長方形を計算
    const rectangle = computeInnerRectangle(points);

    // 凹形状を分割
    const dividedSets = splitConcaveShape(points, rectangle);

    // 各分割された集合に対して再帰的に処理を行う
    const children = dividedSets.map((subset) => buildTreeNodeRecursive(subset));

    // 親ノードに長方形の頂点を格納
    return { rectangle, children };
  }

  // （メイン関数２）各凹部分に対してbuildTreeNodeRectangleを実装する
  function buildTreeFromPointSets(pointSets: Point[][]): TreeNode[] {
    return pointSets.map((points) => buildTreeNodeRecursive(points));
  }

  const onCompute = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {

        const concaveParts = getConcaveParts(concavePoints);
        const innerRectangles = buildTreeFromPointSets(concaveParts);

        console.log('凹み部分', concaveParts);
        console.log('内接長方形のツリー', innerRectangles)

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