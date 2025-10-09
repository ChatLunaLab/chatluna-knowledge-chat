import { Document } from '@langchain/core/documents'
import { DocumentLoader, DocumentLoaderFields } from '../types'
import { TextLoader } from 'langchain/document_loaders/fs/text'
export default class TextDocumentLoader extends DocumentLoader {
    public load(
        path: string,
        fields: DocumentLoaderFields
    ): Promise<Document[]> {
        const loader = new TextLoader(path)

        return loader.load()
    }

    public async support(path: string): Promise<boolean> {
        const ext = path.split('.').pop() || ''

        switch (ext.toLowerCase()) {
            case 'text':
            case 'txt':
            case 'bat':
            case 'java':
            case 'js':
            case 'ts':
            case 'kt':
            case 'lua':
            case 'md':
            case 'cpp':
            case 'go':
            case 'php':
            case 'proto':
            case 'py':
            case 'rst':
            case 'rb':
            case 'rs':
            case 'scala':
            case 'swift':
            case 'tex':
            case 'html':
            case 'sol':
                return true
            default:
                return false
        }
    }
}
