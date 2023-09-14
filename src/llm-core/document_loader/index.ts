import { Context } from 'koishi'
import { DocumentLoader } from './types'
import { Config } from '../..'
import path from 'path'
import fs from 'fs/promises'
import { Document } from 'langchain/dist/document'
import { ChatHubError, ChatHubErrorCode } from '@dingyi222666/koishi-plugin-chathub/lib/utils/error'

export class DefaultDocumentLoader extends DocumentLoader {
    private _loaders: DocumentLoader[] = []
    private _supportLoaders: Record<string, DocumentLoader> = {}

    constructor(
        private ctx: Context,
        private config: Config
    ) {
        super()

        setInterval(() => {
            this._supportLoaders = {}
        }, 1000 * 60)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async load(path: string): Promise<Document<Record<string, any>>> {
        let loader = this._supportLoaders[path]

        if (!loader) {
            const supported = await this.support(path)

            if (!supported) {
                throw new ChatHubError(
                    ChatHubErrorCode.KNOWLEDGE_UNSUPPORTED_FILE_TYPE,
                    new Error(`Unsupported file type: ${path}`)
                )
            }

            loader = this._supportLoaders[path]
        }

        return loader.load(path)
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
            const loader = new exports.default(this.ctx, this.config) as DocumentLoader
            this._loaders.push(loader)
        }
    }
}
