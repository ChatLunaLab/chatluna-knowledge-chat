import { Context } from 'koishi'
import { DocumentLoader, DocumentLoaderFields } from './types'
import { Config } from '../..'
import path from 'path'
import fs from 'fs/promises'
import { Document } from 'langchain/dist/document'
import { ChatHubError, ChatHubErrorCode } from '@dingyi222666/koishi-plugin-chathub/lib/utils/error'
import { RecursiveCharacterTextSplitter } from 'langchain/dist/text_splitter'
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
    public async load(path: string, fields: DocumentLoaderFields): Promise<Document[]> {
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
            throw new ChatHubError(
                ChatHubErrorCode.KNOWLEDGE_UNSUPPORTED_FILE_TYPE,
                new Error(`Unsupported file type: ${path}`)
            )
        }

        loader = this._supportLoaders[path]

        return loader
    }

    async init() {
        const list = await fs.readdir(path.join(__dirname, 'loaders'))

        for (const file of list) {
            if (file.endsWith('.d.ts')) {
                continue
            }

            const exports = await require(path.join(__dirname, 'loaders', file))

            if (!exports.default) {
                continue
            }

            // eslint-disable-next-line new-cap
            const loader = new exports.default(this.ctx, this, this.config) as DocumentLoader
            this._loaders.push(loader)
        }
    }
}
