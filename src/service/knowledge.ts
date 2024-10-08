import { Context, Service } from 'koishi'
import { parseRawModelName } from 'koishi-plugin-chatluna/llm-core/utils/count_tokens'
import { Document } from '@langchain/core/documents'
import { DocumentConfig, RawKnowledgeConfig } from '../types'
import {
    ChatLunaError,
    ChatLunaErrorCode
} from 'koishi-plugin-chatluna/utils/error'
import { VectorStore } from '@langchain/core/vectorstores'
import { DefaultDocumentLoader } from '../llm-core/document_loader'
import { Config, logger } from '..'
import { ChatLunaSaveableVectorStore } from 'koishi-plugin-chatluna/llm-core/model/base'
import { randomUUID } from 'crypto'

export class KnowledgeService extends Service {
    private _vectorStores: Record<string, VectorStore> = {}
    private _loader: DefaultDocumentLoader

    constructor(
        readonly ctx: Context,
        config: Config
    ) {
        super(ctx, 'chatluna_knowledge')
        defineDatabase(ctx)

        ctx.on('dispose', async () => {
            this._vectorStores = {}
        })

        this._loader = new DefaultDocumentLoader(ctx, config)
    }

    async createVectorStore(documentConfig: DocumentConfig) {
        const {
            path,
            id,
            vector_storage: vectorStorage,
            embeddings: embeddingsName
        } = documentConfig

        if (this._vectorStores[path]) {
            return this._vectorStores[path]
        }

        const embeddings = await this.ctx.chatluna.createEmbeddings(
            ...parseRawModelName(embeddingsName)
        )

        const vectorStore = await this.ctx.chatluna.platform.createVectorStore(
            vectorStorage,
            {
                key: id,
                embeddings
            }
        )

        this._vectorStores[path] = vectorStore

        return vectorStore
    }

    async loadVectorStore(path: string) {
        if (this._vectorStores[path]) {
            return this._vectorStores[path]
        }

        const config = await this._getDocumentConfig(path)

        if (!config) {
            throw new ChatLunaError(
                ChatLunaErrorCode.KNOWLEDGE_CONFIG_INVALID,
                new Error(`Knowledge config ${path} not found`)
            )
        }

        const vectorStore = await this.createVectorStore(config)

        return vectorStore
    }

    private async _getDocumentConfig(path: string, vectorStore?: string) {
        let selection = this.ctx.database.select('chathub_knowledge').where({
            path
        })

        if (vectorStore) {
            selection = selection.where({
                vector_storage: vectorStore
            })
        }

        return (await selection.execute())?.[0]
    }

    async deleteDocument(path: string, db: string) {
        const config = await this._getDocumentConfig(
            path,
            db ?? this.ctx.chatluna.config.defaultVectorStore
        )

        if (config == null) {
            throw new ChatLunaError(
                ChatLunaErrorCode.KNOWLEDGE_VECTOR_NOT_FOUND,
                new Error(`Knowledge vector ${path} not found`)
            )
        }

        const vectorStore = await this.createVectorStore(config)

        await vectorStore.delete()

        await this.ctx.database.remove('chathub_knowledge', {
            path
        })
    }

    async loadConfig(rawConfig: RawKnowledgeConfig) {
        const queryList = rawConfig.query

        const result: VectorStore[] = []

        for (const query of queryList) {
            if (typeof query !== 'string') {
                logger.error(
                    `The query ${JSON.stringify(query)} is not a string`
                )
                continue
            }
            logger.info(`Loading knowledge path ${query}`)
            const vectorStore = await this.loadVectorStore(query)

            result.push(vectorStore)
        }

        return result
    }

    public async listDocument(db?: string) {
        let selection = this.ctx.database.select('chathub_knowledge')

        if (db != null) {
            selection = selection.where({
                vector_storage: db
            })
        }

        return selection.execute()
    }

    public async uploadDocument(documents: Document[], path: string) {
        const existsDocument = await this.ctx.database.get(
            'chathub_knowledge',
            { path }
        )

        if (existsDocument.length > 0) {
            return
        }

        const id = randomUUID()

        const config: DocumentConfig = {
            path,
            id,
            vector_storage: this.ctx.chatluna.config.defaultVectorStore,
            embeddings: this.ctx.chatluna.config.defaultEmbeddings
        }

        const vectorStore = await this.createVectorStore(config)

        const chunkDocuments = chunkArray(documents, 40)

        for (const chunk of chunkDocuments) {
            await vectorStore.addDocuments(chunk)
        }

        if (vectorStore instanceof ChatLunaSaveableVectorStore) {
            await vectorStore.save()
        }

        this.ctx.database.upsert('chathub_knowledge', [config])
    }

    public get loader() {
        return this._loader
    }

    static inject = ['database']
}

function defineDatabase(ctx: Context) {
    ctx.database.extend(
        'chathub_knowledge',
        {
            path: { type: 'string', length: 254 },
            id: { type: 'string', length: 254 },
            vector_storage: { type: 'string', length: 254 },
            embeddings: { type: 'string', length: 254 }
        },
        {
            autoInc: false,
            primary: ['path']
        }
    )
}

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const result: T[][] = []
    let startIndex = 0

    try {
        while (startIndex < array.length) {
            // 直接使用下标构建子数组
            const endIndex = Math.min(startIndex + chunkSize, array.length)
            result.push(array.slice(startIndex, endIndex))
            startIndex += chunkSize
        }
    } catch (error) {
        console.error('An error occurred:', error)
    }

    return result
}
