import { createContext, useContext, useState } from 'react';

type NotePathContextType = {
  lastNotePath: string;
  setLastNotePath: (path: string) => void;
};

const NotePathContext = createContext<NotePathContextType>({
  lastNotePath: '/',
  setLastNotePath: () => {},
});

export const NotePathProvider = ({ children }: { children: React.ReactNode }) => {
  const [lastNotePath, setLastNotePath] = useState('/');

  return (
    <NotePathContext.Provider value={{ lastNotePath, setLastNotePath }}>
      {children}
    </NotePathContext.Provider>
  );
};

export const useNotePath = () => useContext(NotePathContext);