import { Document } from 'langchain/dist/document'
import { DocumentLoader, DocumentLoaderFields } from '../types'
import { TextLoader } from 'langchain/document_loaders/fs/text'
export default class TextDocumentLoader extends DocumentLoader {
    public load(path: string, fields: DocumentLoaderFields): Promise<Document[]> {
        const loader = new TextLoader(path)

        return loader.load()
    }

    public async support(path: string): Promise<boolean> {
        const ext = path.split('.').pop() || ''

        switch (ext.toLowerCase()) {
            case 'text':
            case 'txt':
            case 'md':
                return true
            default:
                return false
        }
    }
}