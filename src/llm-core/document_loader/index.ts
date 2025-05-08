import { Context } from 'koishi'
import { DocumentLoader, DocumentLoaderFields } from './types'
import { Config, logger } from '../..'
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
import WebLoader from './loaders/web'
import PPTXDocumentLoader from './loaders/pptx'
import EPUBDocumentLoader from './loaders/epub'
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

        return await this.split(path, documents, fields)
    }

    public async split(
        path: string,
        documents: Document[],
        fields: DocumentLoaderFields
    ): Promise<Document[]> {
        if (fields.type === 'markdown') {
            const splitter = RecursiveCharacterTextSplitter.fromLanguage(
                'markdown',
                {
                    chunkSize: fields.chunkSize || 1000,
                    chunkOverlap: fields.chunkOverlap || 200
                }
            )
            return await splitter.splitDocuments(documents)
        } else if (fields.type === 'code') {
            const language = getLanguageByPath(path)
            if (language) {
                const splitter = RecursiveCharacterTextSplitter.fromLanguage(
                    language,
                    {
                        chunkSize: fields.chunkSize || 1000,
                        chunkOverlap: fields.chunkOverlap || 200
                    }
                )

                return await splitter.splitDocuments(documents)
            }
        }

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: fields.chunkSize || 1000,
            chunkOverlap: fields.chunkOverlap || 200
        })

        return await splitter.splitDocuments(documents)
    }

    public async support(path: string): Promise<boolean> {
        for (const loader of this._loaders) {
            try {
                if (await loader.support(path)) {
                    this._supportLoaders[path] = loader
                    return true
                }
            } catch (e) {
                continue
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
                new PDFDocumentLoader(ctx, config, parent),
            (ctx: Context, config: Config, parent?: DocumentLoader) =>
                new PPTXDocumentLoader(ctx, config, parent),
            (ctx: Context, config: Config, parent?: DocumentLoader) =>
                new EPUBDocumentLoader(ctx, config, parent)
        ]

        if (this.config.unstructuredApiKey?.length > 0) {
            loaders.push(
                (ctx: Context, config: Config, parent?: DocumentLoader) =>
                    new UnstructuredDocumentLoader(ctx, config, parent)
            )
        } else {
            loaders.push(
                (ctx: Context, config: Config, parent?: DocumentLoader) =>
                    new WebLoader(ctx, config, parent)
            )
        }

        for (const loader of loaders) {
            this._loaders.push(loader(this.ctx, this.config, this))
        }
    }
}

function getLanguageByPath(path: string) {
    const ext = path.split('.').pop()?.toLowerCase()
    switch (ext) {
        case 'cpp':
        case 'c':
        case 'h':
        case 'hpp':
            return 'cpp'
        case 'go':
            return 'go'
        case 'java':
            return 'java'
        case 'js':
        case 'ts':
            return 'js'
        case 'php':
            return 'php'
        case 'proto':
            return 'proto'
        case 'py':
            return 'python'
        case 'rst':
            return 'rst'
        case 'rb':
            return 'ruby'
        case 'rs':
            return 'rust'
        case 'scala':
            return 'scala'
        case 'swift':
            return 'swift'
        case 'md':
            return 'markdown'
        case 'tex':
            return 'latex'
        case 'html':
        case 'htm':
            return 'html'
        case 'sol':
            return 'sol'
        default:
            return null
    }
}
