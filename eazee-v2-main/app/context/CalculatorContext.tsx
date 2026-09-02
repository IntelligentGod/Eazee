import React, { createContext, useContext, useState } from 'react';

type CalculatorContextType = {
  showCalculator: () => void;
  hideCalculator: () => void;
  calculatorResult: string;
  getDisplayContent: () => string;
  handlePushResult: () => void;
  isPushed: boolean;
  exchange: boolean;
  setIsPushed: React.Dispatch<React.SetStateAction<boolean>>;
};

const CalculatorContext = createContext<CalculatorContextType | undefined>(undefined);

export const CalculatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPushed, setIsPushed] = useState(false);

  const value: CalculatorContextType = {
    showCalculator: () => {},
    hideCalculator: () => {},
    calculatorResult: '',
    getDisplayContent: () => '',
    handlePushResult: () => {},
    isPushed,
    exchange: false,
    setIsPushed,
  };

  return <CalculatorContext.Provider value={value}>{children}</CalculatorContext.Provider>;
};

export const useCalculator = () => {
  const context = useContext(CalculatorContext);
  if (!context) {
    throw new Error('useCalculator must be used within a CalculatorProvider');
  }
  return context;
};
