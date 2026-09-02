import { Model } from "@nozbe/watermelondb";
import { field, text, children, date } from "@nozbe/watermelondb/decorators";
import { Associations } from "@nozbe/watermelondb/Model";
import Note from './NoteModel';  

class Folder extends Model {
    static table = 'folders';
    static associations: Associations = {
        // 'folders': { type: 'has_many', foreignKey: 'parent_id' },
        'notes': { type: 'has_many', foreignKey: 'folder_id' },
    };
    // @ts-ignore
    @text('name') name!: string;
    // @ts-ignore
    @field('expanded') expanded!: boolean;
    // @ts-ignore
    @text('parent_id') parentId?: string;
    // @ts-ignore
    @field('total_notes') totalNotes!: number; 
    // @ts-ignore
    @children('folders') subfolders!: Folder[];
    // @ts-ignore
    @children('notes') notes!: Note[];

    // Add created_at and updated_at fields
    // @ts-ignore
    @date('created_at') createdAt!: Date;
    // @ts-ignore
    @date('updated_at') updatedAt!: Date;
}

export default Folder;