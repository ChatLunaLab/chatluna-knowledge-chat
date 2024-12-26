import { Context } from 'koishi'
import { Document } from '@langchain/core/documents'
import { Config } from '../..'

export abstract class DocumentLoader {
    constructor(
        protected ctx: Context,
        protected config: Config,
        protected parent?: DocumentLoader
    ) {}

    public abstract support(path: string): Promise<boolean>

    public abstract load(
        path: string,
        fields: DocumentLoaderFields
    ): Promise<Document[]>
}

export interface DocumentLoaderFields {
    chunkSize?: number
    chunkOverlap?: number
    type: string
}
