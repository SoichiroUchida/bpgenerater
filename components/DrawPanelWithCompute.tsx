import React, { useEffect, useRef, useState } from 'react';
import ComputeButton from './ComputeButton';

interface DrawPanelWithComputeProps {
  points: { x: number; y: number }[];
}

interface Point {
  x: number;
  y: number;
}

interface Rectangle {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

interface TreeNode {
  rectanglePoints: Point[];
  children: TreeNode[];
}

const DrawPanelWithCompute: React.FC<DrawPanelWithComputeProps> = ({ points }) => {
  const [isComputed, setIsComputed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ポイントの外接長方形を計算する
  const computeBoundingRectangle = (points: Point[]): Rectangle => {
    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);

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

  // 長方形をポイントの配列に変換する関数
  const rectangleToPointsArray = (rectangle: Rectangle): Point[] => {
    return [
      rectangle.topLeft,
      rectangle.topRight,
      rectangle.bottomRight,
      rectangle.bottomLeft,
    ];
  };

  // ポイントの最小値と最大値を取得する
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

  // 凹み部分を計算する
  const getConcaveParts = (rectangle: Rectangle, points: Point[]): Point[][] => {
    const concaveIndices: number[] = points
      .map((point, index) => {
        const isOnEdge =
          point.y === rectangle.topLeft.y ||
          point.y === rectangle.bottomLeft.y ||
          point.x === rectangle.topLeft.x ||
          point.x === rectangle.topRight.x;
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
      if (group[group.length - 1] < points.length - 1) group.push(group[group.length - 1] + 1);
    });

    return groupedIndices.map((group) => group.map((index) => points[index]));
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

  // 幅のある平行型の探索に関する交差チェック
  const areLinesCoincidentOrIntersect = (
    pointA: Point,
    pointB: Point,
    start: Point,
    end: Point
  ): boolean => {
    // 4点が同一直線上にあるかを判定
    const orientation = (p: Point, q: Point, r: Point) =>
      (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    const onSameLine =
      orientation(pointA, pointB, start) === 0 &&
      orientation(pointA, pointB, end) === 0 &&
      orientation(start, end, pointA) === 0;

    const pointsEqual = (p1: Point, p2: Point) => p1.x === p2.x && p1.y === p2.y;

    const cross1 =
      (pointsEqual(pointA, start) && pointsEqual(pointB, end)) ||
      (pointsEqual(pointA, end) && pointsEqual(pointB, start));

    const isBetween = (a: number, b: number, c: number) =>
      (a < b && b < c) || (c < b && b < a);

    const cross2 =
      ((pointA.y === pointB.y) &&
        (isBetween(start.x, pointA.x, end.x) ||
          isBetween(start.x, pointB.x, end.x) ||
          isBetween(pointA.x, start.x, pointB.x) ||
          isBetween(pointB.x, end.x, pointA.x))) ||
      ((pointA.x === pointB.x) &&
        (isBetween(start.y, pointA.y, end.y) ||
          isBetween(start.y, pointB.y, end.y) ||
          isBetween(pointA.y, start.y, pointB.y) ||
          isBetween(pointB.y, end.y, pointA.y)));

    return onSameLine && (cross1 || cross2);
  };

  // 幅のない平行型の探索に関する交差チェック
  const doLinesIntersectSimple = (
    pointA: Point,
    pointB: Point,
    start: Point,
    end: Point
  ): boolean => {
    const isBetween = (a: number, b: number, c: number) =>
      (a < b && b < c) || (c < b && b < a);

    if (start.x === end.x) {
      return isBetween(pointA.x, start.x, pointB.x) && isBetween(start.y, pointA.y, end.y);
    } else {
      return isBetween(pointA.y, start.y, pointB.y) && isBetween(start.x, pointA.x, end.x);
    }
  };

  // 点が多角形の内部に入っているか判定する関数
  function isPointInsidePolygon(polygon: Point[], point: Point): boolean {
    let inside = false;
  
    // 多角形の各辺を順にチェック
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
  
      // 点が辺上にあるかをチェック
      if (isPointOnLineSegment(point, polygon[i], polygon[j])) {
        return true; // 境界上にある場合は true
      }
  
      // 射影法（ray casting algorithm）による内部判定
      const intersect =
        ((yi > point.y) !== (yj > point.y)) &&
        (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-10) + xi);
  
      if (intersect) {
        inside = !inside;
      }
    }
  
    return inside;
  }

  // 3つの数値の大小関係の判定
  // 入力した順に並んでいればTそうでなければFを返す
  function getNumbersOrder(a:Number, b:Number, c:Number): boolean {
    return (a < b && b < c) || (c < b && b < a);
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

  // 点が長方形の辺上に存在するかを判定する関数
  function isPointOnRectanglePerimeter(p: Point, rectangle: Point[]): boolean {
    for (let i = 0; i < rectangle.length; i++) {
      const a = rectangle[i];
      const b = rectangle[(i + 1) % rectangle.length];
      if (isPointOnLineSegment(p, a, b)) {
        return true;
      }
    }
    return false;
  }

  // ２つのベクトルの位置関係を判定する関数
  function getTowVectordirections(firstPoint:Point, lastPoitn:Point, nextPoint:Point, shiftX:Number): boolean {
    let towVectorDirections = true;
    if (shiftX == 0) {
      towVectorDirections = getNumbersOrder(lastPoitn.y, firstPoint.y, nextPoint.y)
    } else {
      towVectorDirections = getNumbersOrder(lastPoitn.x, firstPoint.x, nextPoint.x)
    }

    return towVectorDirections;
  }

  // 内接四角形の計算
  const computeInnerRectangle = (concavePoints: Point[]): Rectangle => {
    const createRectangle = (
      firstPoint: Point,
      movedFirstPoint: Point,
      lastPoint: Point,
      movedLastPoint: Point
    ) => {
      return {
        topLeft: firstPoint,
        topRight: movedFirstPoint,
        bottomRight: movedLastPoint,
        bottomLeft: lastPoint,
      };
    };

    const points = concavePoints;
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    let shiftX = 0;
    let shiftY = 0;
    let oppositeShiftX = 0;
    let oppositeShiftY = 0;
    let scale = 20;

    const adjacentFirstPoint = points[1];
    const adjacentLastPoint = points[points.length - 2];

    // 進行方向の計算
    if (firstPoint.y === adjacentFirstPoint.y)
      shiftX = firstPoint.x < adjacentFirstPoint.x ? scale : -1 * scale;
    else shiftY = firstPoint.y < adjacentFirstPoint.y ? scale : -1 * scale;

    if (lastPoint.y === adjacentLastPoint.y)
      oppositeShiftX = lastPoint.x < adjacentLastPoint.x ? scale : -1 * scale;
    else oppositeShiftY = lastPoint.y < adjacentLastPoint.y ? scale : -1 * scale;

    // 入口平行型の凹みに対するアルゴリズム
    if (firstPoint.x === lastPoint.x || firstPoint.y === lastPoint.y) {
      // 最初と最後の点が一致する場合
      if (firstPoint.x === lastPoint.x && firstPoint.y === lastPoint.y) {
        /*{
        const { minX, maxX, minY, maxY } = getMinMaxXY(points);
        const movedFirstPoint: Point =
          shiftX > 0
            ? { x: maxX, y: firstPoint.y }
            : shiftX < 0
            ? { x: minX, y: firstPoint.y }
            : shiftY > 0
            ? { x: firstPoint.x, y: maxY }
            : { x: firstPoint.x, y: minY };
      }*/
        const movedFirstPoint: Point = {x:firstPoint.x + shiftX, y:firstPoint.y + shiftX};

        let tempMovedFirstPoint = { ...movedFirstPoint };

        // 交差するまで続ける
        while (isPointInsidePolygon(points, tempMovedFirstPoint)) {
          tempMovedFirstPoint = {
            x: tempMovedFirstPoint.x + (0.5 * shiftX),
            y: tempMovedFirstPoint.y + (0.5 * shiftY),
          };
        }

        tempMovedFirstPoint = {
          x: tempMovedFirstPoint.x - (0.5 * shiftX),
          y: tempMovedFirstPoint.y - (0.5 * shiftY),
        };

        return createRectangle(firstPoint, tempMovedFirstPoint, firstPoint, tempMovedFirstPoint);
      } else {
        const movedFirstPoint: Point = { x: firstPoint.x + shiftX, y: firstPoint.y + shiftY };
        const movedLastPoint: Point = { x: lastPoint.x + shiftX, y: lastPoint.y + shiftY };

        let intersectionFound = false;
        let tempMovedFirstPoint = { ...movedFirstPoint };
        let tempMovedLastPoint = { ...movedLastPoint };

        let maxIterations = 10;
        let iterationCount = 0;
        while (!intersectionFound) {
          iterationCount++;

          if (iterationCount > maxIterations) {
            console.error('エラー: （非一致型）反復回数が多すぎます。');
            break;
          }

          for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];

            if (areLinesCoincidentOrIntersect(tempMovedLastPoint, tempMovedFirstPoint, start, end)) {
              intersectionFound = true;
              break;
            }
          }

          // 交差が見つかっていない場合は、ポイントを更新
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
        return createRectangle(firstPoint, tempMovedFirstPoint, lastPoint, tempMovedLastPoint);
      }
    } else {
      // 入口非平行型
      const movedFirstPoint: Point = { x: firstPoint.x, y: firstPoint.y };
      const movedLastPoint: Point = { x: lastPoint.x, y: lastPoint.y };

      if (getTowVectordirections(firstPoint, lastPoint, adjacentFirstPoint, shiftX)) {
        if (shiftX == 0) {
          movedFirstPoint.y = lastPoint.y;
        } else {
          movedFirstPoint.x = lastPoint.x;
        }
      } else {
        if (shiftX == 0) {
          movedLastPoint.y = firstPoint.y;
        } else {
          movedLastPoint.x = firstPoint.x;
        }
      }

      let intersectionFound = false;
      let tempMovedFirstPoint = { ...movedFirstPoint };
      let tempMovedLastPoint = { ...movedLastPoint };

      let maxIterations = 10;
      let iterationCount = 0;
      while (!intersectionFound) {
        iterationCount++;

        if (iterationCount > maxIterations) {
          console.error('エラー: （非平行型）反復回数が多すぎます。');
          break;
        }

        console.log(`Iteration ${iterationCount}, checking intersections...`);

        for (let i = 0; i < points.length; i++) {
          const start = points[i];
          const end = points[(i + 1) % points.length];

          if (areLinesCoincidentOrIntersect(tempMovedLastPoint, tempMovedFirstPoint, start, end)) {
            intersectionFound = true;
            break;
          }
        }

        // 交差が見つかっていない場合は、ポイントを更新
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
      return createRectangle(movedFirstPoint, tempMovedFirstPoint, movedLastPoint, tempMovedLastPoint);
    }
  };

  // 凹部分の分割関数
  function splitConcaveShape(concave: Point[], rectangle: Point[]): Point[][] {
    const result: Point[][] = [];
    let currentSet: Point[] | null = null;

    for (let i = 0; i < concave.length - 1; i++) {
      let start = concave[i];
      let end = concave[i + 1];

      const startOnEdge = isPointOnRectanglePerimeter(start, rectangle);
      const endOnEdge = isPointOnRectanglePerimeter(end, rectangle);

      // 点が線分の両端に存在するか判定する関数
      const isPointOnEndpoints = (p: Point, a: Point, b: Point): boolean => {
        return (p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y);
      };

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
    const finalResult: Point[][] = result.map((set) => {
      const simplifiedSet: Point[] = [];
      for (let i = 0; i < set.length; i++) {
        const point = set[i];
        if (i === 0 || point.x !== set[i - 1].x || point.y !== set[i - 1].y) {
          simplifiedSet.push(point);
        }
      }
      return simplifiedSet;
    });

    return finalResult;
  }

  // 各点の集合に対して再帰的に処理を実装する
  function buildTreeFromPointSets(pointSets: Point[][]): TreeNode[] {
    return pointSets.map((points) => buildTreeNodeRecursive(points));
  }

  // 再帰的にノードを構築
  function buildTreeNodeRecursive(points: Point[]): TreeNode {
    // 点の集合が4点以下の場合、再帰を終了
    if (points.length <= 4) {
      const rectangle = computeInnerRectangle(points);
      const rectanglePoints = rectangleToPointsArray(rectangle);
      return { rectanglePoints, children: [] };
    }

    // 内接長方形を計算
    const rectangle = computeInnerRectangle(points);

    // 長方形の頂点を取得
    const rectanglePoints = rectangleToPointsArray(rectangle);

    // 凹形状を分割
    const dividedSets = splitConcaveShape(points, rectanglePoints);

    // 各分割された集合に対して再帰的に処理を行う
    const children = dividedSets.map((subset) => buildTreeNodeRecursive(subset));

    // 親ノードに長方形の頂点を格納
    return { rectanglePoints, children };
  }

  const onCompute = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        const rectangle = computeBoundingRectangle(points);
        const concaveParts = getConcaveParts(rectangle, points);
        const treeNodes = buildTreeFromPointSets(concaveParts);
        const firstConcavePart = concaveParts[0];
        const innerRectangle = computeInnerRectangle(firstConcavePart);
        const innerRectanglePoints = rectangleToPointsArray(innerRectangle);
        const dividedShapes = splitConcaveShape(firstConcavePart, innerRectanglePoints);

        console.log('凹み部分', concaveParts);
        console.log('1つ目の凹み部分', firstConcavePart);
        console.log('1つ目の凹み長方形', innerRectanglePoints);
        console.log('1回目の分割多角形', dividedShapes);
        console.log('完成したツリー', treeNodes);

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

export default DrawPanelWithCompute;
