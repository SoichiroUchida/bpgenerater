import React from 'react';

interface UndoButtonProps {
  onClick: () => void;
}

const ComputeButton: React.FC<UndoButtonProps> = ({ onClick }) => {
  return (
    <button onClick={onClick} style={{ padding: '10px 20px', cursor: 'pointer' }}>
      1つ戻る
    </button>
  );
};

export default ComputeButton;