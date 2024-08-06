import { Document } from '@langchain/core/documents'
import { DocumentLoader, DocumentLoaderFields } from '../types'
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio'

export default class WebLoader extends DocumentLoader {
    public load(
        path: string,
        fields: DocumentLoaderFields
    ): Promise<Document[]> {
        const loader = new CheerioWebBaseLoader(path, {
            timeout: 1000 * 60 * 2
        })

        return loader.load()
    }

    public async support(path: string): Promise<boolean> {
        // start with (http|https)://
        return /^(http|https):\/\//.test(path)
    }
}
