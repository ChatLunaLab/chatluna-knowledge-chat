import { Document } from 'langchain/dist/document'
import { DocumentLoader, DocumentLoaderFields } from '../types'
import { JSONLoader } from 'langchain/document_loaders/fs/json'
export default class JsonLoader extends DocumentLoader {
    public load(path: string, fields: DocumentLoaderFields): Promise<Document[]> {
        const loader = new JSONLoader(path)

        return loader.load()
    }

    public async support(path: string): Promise<boolean> {
        const ext = path.split('.').pop() || ''

        return ext.toLowerCase() === 'json'
    }
}
