import { Document } from '@langchain/core/documents'
import { DocumentLoader, DocumentLoaderFields } from '../types'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'

export default class PPTXDocumentLoader extends DocumentLoader {
    public load(
        path: string,
        fields: DocumentLoaderFields
    ): Promise<Document[]> {
        const loader = new PPTXLoader(path)

        return loader.load()
    }

    public async support(path: string): Promise<boolean> {
        const ext = path.split('.').pop() || ''

        return ext.toLowerCase() === 'ppt' || ext.toLowerCase() === 'pptx'
    }
}
