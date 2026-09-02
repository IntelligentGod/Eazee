import React, { createContext, useState, useContext, ReactNode } from 'react';

interface DraftContextType {
  editedContent: string | null;
  emailId: string | null;
  updateDraft: (content: string, id: string) => void;
  clearDraft: () => void;
}

const DraftContext = createContext<DraftContextType | undefined>(undefined);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [emailId, setEmailId] = useState<string | null>(null);

  const updateDraft = (content: string, id: string) => {
    setEditedContent(content);
    setEmailId(id);
  };

  const clearDraft = () => {
    setEditedContent(null);
    setEmailId(null);
  };

  return (
    <DraftContext.Provider value={{ editedContent, emailId, updateDraft, clearDraft }}>
      {children}
    </DraftContext.Provider>
  );
}

export function useDraft() {
  const context = useContext(DraftContext);
  if (context === undefined) {
    throw new Error('useDraft must be used within a DraftProvider');
  }
  return context;
}