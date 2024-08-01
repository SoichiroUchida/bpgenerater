import React, { useState, useEffect } from 'react';
import Tabs from '../components/Tabs';
import DrawPanel from '../components/DrawPanel';
import DrawPanelWithCompute from '../components/DrawPanelWithCompute';

const Home: React.FC = () => {
  const [points, setPoints] = useState<{ x: number, y: number }[]>([]);
  const [tabs, setTabs] = useState<{ title: string; content: React.ReactNode }[]>([]);

  useEffect(() => {
    setTabs([
      { 
        title: '多角形の入力',
        content: (
          <div>
            <h2> エラーメッセージ予定地
            </h2>
            <DrawPanel onPointsChange={setPoints} /> 
          </div>
        )
      },
      { 
        title: '展開図の出力',
        content: <DrawPanelWithCompute points={points} /> }
    ]);
  }, [points]);

  return (
    <div>
      <h1>Box Pleating Generater</h1>
      <Tabs tabs={tabs} />
    </div>
  );
};

export default Home;
