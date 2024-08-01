import React, { useState, useEffect } from 'react';
import Tabs from '../components/Tabs';
import DrawPanel from '../components/DrawPanel';
import DrawPanelWithCompute from '../components/DrawPanelWithCompute';

const Home: React.FC = () => {
  const [points, setPoints] = useState<{ x: number, y: number }[]>([]);
  const [tabs, setTabs] = useState<{ title: string; content: React.ReactNode }[]>([]);

  useEffect(() => {
    setTabs([
      { title: 'Tab 1', content: <div>Content for Tab 1</div> },
      { title: 'Tab 2', content: <DrawPanel onPointsChange={setPoints} /> },
      { title: 'Tab 3', content: <DrawPanelWithCompute points={points} /> }
    ]);
  }, [points]);

  return (
    <div>
      <h1>My Tabs</h1>
      <Tabs tabs={tabs} />
    </div>
  );
};

export default Home;
