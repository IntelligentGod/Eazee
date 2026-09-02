import React, { forwardRef, useImperativeHandle, useMemo, useState, useEffect } from 'react';
import { database } from '../../../database/database';
import Note from '../../../database/models/NoteModel';
import { TextInput, View } from 'react-native';

interface EditorProps {
  initialContent: string;
  onChange?: (content: string) => void;
  noteId?: string;
  editable?: boolean; 

}

export interface EditorHandle {
  editor: null;
  getHTML: () => Promise<string>;
  setContent: (content: string) => void;
}
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;

  return function executedFunction(...args: any) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};
const Editor = forwardRef<EditorHandle, EditorProps>(({ initialContent, onChange, noteId, editable = true }, ref) => {
  const [content, setContent] = useState(initialContent);

  const saveNoteContentDebounced = useMemo(() => debounce(async () => {
    if (content && content.trim().length > 0) {
      try {
        await database.write(async () => {
          if (noteId) {
            const noteToUpdate = await database.get<Note>('notes').find(noteId);

            if (noteToUpdate) {
              await noteToUpdate.update((note) => {
                note.content = content;
                note.timestamp = new Date();
                note.edited = true;
              });
            }
          }
          else {
            console.error('Note not found');
          }
        });
      } catch (e) {
        console.error('Failed to save note content', e);
      }
    }
  }, 100), [content, noteId]);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    saveNoteContentDebounced();
  }, [content, saveNoteContentDebounced]);

  useImperativeHandle(ref, () => ({
    editor: null,
    getHTML: async () => content,
    setContent: (nextContent: string) => setContent(nextContent),
  }));

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        value={content}
        onChangeText={(nextContent) => {
          setContent(nextContent);
          onChange?.(nextContent);
        }}
        editable={editable}
        multiline
        textAlignVertical="top"
        style={{ flex: 1, backgroundColor: '#FEFEE8', fontSize: 16, lineHeight: 22, padding: 12 }}
        placeholder="Untitled.."
      />
    </View>
  );
});

export default Editor;