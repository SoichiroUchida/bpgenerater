import React from 'react';

const ComputeButton: React.FC = () => {
  const handleClick = () => {
    // 計算処理
  };

  return (
    <button onClick={handleClick} style={{ marginTop: '10px', padding: '10px 20px', cursor: 'pointer' }}>
      計算
    </button>
  );
};

export default ComputeButton;
