import React, { useEffect, useState } from 'react';

interface PolygonValidatorProps {
  points: { x: number, y: number }[];
}

const PolygonValidator: React.FC<PolygonValidatorProps> = ({ points }) => {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const isClosedPolygon = () => {
      if (points.length < 3) return false;
      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      return firstPoint.x === lastPoint.x && firstPoint.y === lastPoint.y;
    };

    const isSelfIntersecting = () => {
      const doLinesIntersect = (p1: any, p2: any, q1: any, q2: any) => {
        const orientation = (p: any, q: any, r: any) => {
          const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
          if (val === 0) return 0; // collinear
          return val > 0 ? 1 : 2; // clock or counterclockwise
        };

        const o1 = orientation(p1, p2, q1);
        const o2 = orientation(p1, p2, q2);
        const o3 = orientation(q1, q2, p1);
        const o4 = orientation(q1, q2, p2);

        if (o1 !== o2 && o3 !== o4) return true;

        return false;
      };

      for (let i = 0; i < points.length - 1; i++) {
        for (let j = i + 2; j < points.length - 1; j++) {
          if (i === 0 && j === points.length - 2) continue; // skip adjacent segments
          if (doLinesIntersect(points[i], points[i + 1], points[j], points[j + 1])) {
            return true;
          }
        }
      }
      return false;
    };

    if (!isClosedPolygon()) {
      setMessage('単純多角形を入力してください');
    } else if (isSelfIntersecting()) {
      setMessage('単純多角形を入力してください');
    } else {
      setMessage('');
    }
  }, [points]);

  return (
    <div style={{ minHeight: '20px' }}>
      {message ? <p style={{ color: 'red' }}>{message}</p> : <p style={{ visibility: 'hidden' }}>No errors</p>}
    </div>
  );
};

export default PolygonValidator;