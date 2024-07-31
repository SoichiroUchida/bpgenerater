import React from 'react';

interface ComputeButtonProps {
  onClick: () => void;
}

const ComputeButton: React.FC<ComputeButtonProps> = ({ onClick }) => {
  return (
    <button onClick={onClick} style={{ marginTop: '10px', padding: '10px 20px', cursor: 'pointer' }}>
      計算
    </button>
  );
};

export default ComputeButton;
