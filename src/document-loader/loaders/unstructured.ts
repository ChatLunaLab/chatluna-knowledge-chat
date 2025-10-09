import { Document } from '@langchain/core/documents'
import { DocumentLoader, DocumentLoaderFields } from '../types'
import {
    UnstructuredLoader,
    UnstructuredMemoryLoaderOptions
} from '@langchain/community/document_loaders/fs/unstructured'
import { readFile } from 'fs/promises'

export default class UnstructuredDocumentLoader extends DocumentLoader {
    public async load(
        path: string,
        fields: DocumentLoaderFields
    ): Promise<Document[]> {
        let options: string | UnstructuredMemoryLoaderOptions = path

        if (!path.startsWith('http')) {
            options = await this.readFile(path)
        }

        const loader = new UnstructuredLoader(options, {
            apiKey: this.config.unstructuredApiKey,
            apiUrl: this.config.unstructuredApiEndpoint
        })

        return loader.load()
    }

    async readFile(path: string): Promise<UnstructuredMemoryLoaderOptions> {
        const buffer = await readFile(path)

        const fileName = path.split('/').pop() || ''
        return {
            buffer,
            fileName
        }
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
