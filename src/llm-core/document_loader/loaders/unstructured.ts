import { Document } from 'langchain/document'
import { DocumentLoader, DocumentLoaderFields } from '../types'
import { UnstructuredLoader } from 'langchain/document_loaders/fs/unstructured'

export default class UnstructuredDocumentLoader extends DocumentLoader {
    public load(path: string, fields: DocumentLoaderFields): Promise<Document[]> {
        const loader = new UnstructuredLoader(path, {
            apiKey: this.config.unstructuredApiKey,
            apiUrl: this.config.unstructuredApiEndpoint
        })

        return loader.load()
    }

    public async support(path: string): Promise<boolean> {
        const ext = path.split('.').pop() || ''

        const supportExt = [
            'jpg',
            'jpeg',
            'png',
            'gif',
            'bmp',
            'pdf',
            'docx',
            'ppt',
            'epub',
            'xlsx',
            'xls',
            'pptx',
            'doc',
            'rtf'
        ]

        return supportExt.indexOf(ext.toLowerCase()) !== -1
    }
}
