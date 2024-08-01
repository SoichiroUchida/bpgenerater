import React, { useState } from 'react';
import Tabs from '../components/Tabs';
import DrawPanel from '../components/DrawPanel';
import DrawPanelWithCompute from '../components/DrawPanelWithCompute';

const Home: React.FC = () => {
  const [points, setPoints] = useState<{ x: number, y: number }[]>([]);

  const tabs = [
    { title: '多角形の入力', content: <DrawPanel onPointsChange={setPoints} /> },
    { title: '展開図の計算', content: <DrawPanelWithCompute points={points} /> }
  ];

  return (
    <div>
      <h1>My Tabs</h1>
      <Tabs tabs={tabs} />
    </div>
  );
};

export default Home;
