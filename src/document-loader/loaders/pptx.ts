import { Document } from '@langchain/core/documents'
import { DocumentLoader, DocumentLoaderFields } from '../types'

export default class PPTXDocumentLoader extends DocumentLoader {
    public async load(
        path: string,
        fields: DocumentLoaderFields
    ): Promise<Document[]> {
        const PPTXLoader = await PPTXDocumentLoader.importPPTXLoader()
        const loader = new PPTXLoader(path)

        return loader.load()
    }

    public async support(path: string): Promise<boolean> {
        const ext = path.split('.').pop() || ''

        return ext.toLowerCase() === 'ppt' || ext.toLowerCase() === 'pptx'
    }

    static async importPPTXLoader(): Promise<
        typeof import('@langchain/community/document_loaders/fs/pptx').PPTXLoader
    > {
        try {
            return (
                await import('@langchain/community/document_loaders/fs/pptx')
            ).PPTXLoader
        } catch (e) {
            console.error(e)
            throw new Error(
                'Please install pptx loader: npm install officeparser'
            )
        }
    }
}
