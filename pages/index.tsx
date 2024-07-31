import React from 'react';
import Tabs from '../components/Tabs';
import DrawPanel from '../components/DrawPanel';
import DrawPanelWithCompute from '../components/DrawPanelWithCompute';

const Home: React.FC = () => {
  const tabs = [
    { title: '多角形の入力', content: <DrawPanel /> },
      { title: '展開図の計算', content: <DrawPanelWithCompute />}
  ];

  return (
    <div>
      <h1>My Tabs</h1>
      <Tabs tabs={tabs} />
    </div>
  );
};

export default Home;
