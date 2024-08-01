import React from 'react';

interface ClearButtonProps {
  onClick: () => void;
}

const ClearButton: React.FC<ClearButtonProps> = ({ onClick }) => {
  return (
    <button onClick={onClick} style={{ marginTop: '10px', padding: '10px 20px', cursor: 'pointer' }}>
      取り消し
    </button>
  );
};

export default ClearButton;