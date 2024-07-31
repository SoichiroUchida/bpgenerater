import React from 'react';
import Tabs from '../components/Tabs';

const Home: React.FC = () => {
  const tabs = [
    { title: 'Tab 1', content: <div>Content for Tab 1</div> },
    { title: 'Tab 2', content: <div>Content for Tab 2</div> },
    { title: 'Tab 3', content: <div>Content for Tab 3</div> }
  ];

  return (
    <div>
      <h1>My Tabs</h1>
      <Tabs tabs={tabs} />
    </div>
  );
};

export default Home;
