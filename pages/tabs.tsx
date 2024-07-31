import React, { useState } from 'react';

interface TabProps {
  title: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: TabProps[];
}

const Tabs: React.FC<TabsProps> = ({ tabs }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div>
      <div style={{ display: 'flex' }}>
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => setActiveIndex(index)}
            style={{
              padding: '10px 20px',
              cursor: 'pointer',
              backgroundColor: activeIndex === index ? '#ddd' : '#fff',
              borderBottom: activeIndex === index ? '2px solid black' : 'none'
            }}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div style={{ padding: '20px', border: '1px solid #ddd' }}>
        {tabs[activeIndex].content}
      </div>
    </div>
  );
};

export default Tabs;
