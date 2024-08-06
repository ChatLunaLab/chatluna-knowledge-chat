import { Context } from 'koishi'
import { DocumentLoader, DocumentLoaderFields } from './types'
import { Config } from '../..'
import { Document } from '@langchain/core/documents'
import {
    ChatLunaError,
    ChatLunaErrorCode
} from 'koishi-plugin-chatluna/utils/error'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import JsonLoader from './loaders/json'
import TextDocumentLoader from './loaders/text'
import CSVDocumentLoader from './loaders/csv'
import DirectoryLoader from './loaders/directory'
import DocXDocumentLoader from './loaders/doc'
import UnstructuredDocumentLoader from './loaders/unstructured'
import PDFDocumentLoader from './loaders/pdf'
export class DefaultDocumentLoader extends DocumentLoader {
    private _loaders: DocumentLoader[] = []
    private _supportLoaders: Record<string, DocumentLoader> = {}

    constructor(ctx: Context, config: Config) {
        super(ctx, config, null)

        setInterval(() => {
            this._supportLoaders = {}
        }, 1000 * 60)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async load(
        path: string,
        fields: DocumentLoaderFields
    ): Promise<Document[]> {
        const loader = await this._getLoader(path)

        const documents = await loader.load(path, fields)

        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: fields.chunkSize ?? 1000,
            chunkOverlap: fields.chunkOverlap ?? 100
        })

        return await textSplitter.splitDocuments(documents)
    }

    public async support(path: string): Promise<boolean> {
        for (const loader of this._loaders) {
            if (await loader.support(path)) {
                this._supportLoaders[path] = loader
                return true
            }
        }

        return false
    }

    private async _getLoader(path: string) {
        let loader = this._supportLoaders[path]

        if (loader) {
            return loader
        }

        const supported = await this.support(path)

        if (!supported) {
            throw new ChatLunaError(
                ChatLunaErrorCode.KNOWLEDGE_UNSUPPORTED_FILE_TYPE,
                new Error(`Unsupported file type: ${path}`)
            )
        }

        loader = this._supportLoaders[path]

        return loader
    }

    async init() {
        const loaders = [
            (ctx: Context, config: Config, parent?: DocumentLoader) =>
                new JsonLoader(ctx, config, parent),
            (ctx: Context, config: Config, parent?: DocumentLoader) =>
                new TextDocumentLoader(ctx, config, parent),
            (ctx: Context, config: Config, parent?: DocumentLoader) =>
                new CSVDocumentLoader(ctx, config, parent),
            (ctx: Context, config: Config, parent?: DocumentLoader) =>
                new DirectoryLoader(ctx, config, parent),
            (ctx: Context, config: Config, parent?: DocumentLoader) =>
                new DocXDocumentLoader(ctx, config, parent),
            (ctx: Context, config: Config, parent?: DocumentLoader) =>
                new UnstructuredDocumentLoader(ctx, config, parent),
            (ctx: Context, config: Config, parent?: DocumentLoader) =>
                new PDFDocumentLoader(ctx, config, parent)
        ]
        for (const loader of loaders) {
            this._loaders.push(loader.call(this.ctx, this.config, this))
        }
    }
}
