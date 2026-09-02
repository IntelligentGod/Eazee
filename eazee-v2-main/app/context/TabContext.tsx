import React, { createContext, useContext, useState } from 'react';

type TabContextType = {
  glowingTab: string | null;
  setGlowingTab: (tab: string | null) => void;
};

const TabContext = createContext<TabContextType>({
  glowingTab: null,
  setGlowingTab: () => {},
});

export const TabProvider = ({ children }: { children: React.ReactNode }) => {
  const [glowingTab, setGlowingTab] = useState<string | null>(null);

  return (
    <TabContext.Provider value={{ glowingTab, setGlowingTab }}>
      {children}
    </TabContext.Provider>
  );
};

export const useTabContext = () => useContext(TabContext);