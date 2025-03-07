import { Context, Service } from 'koishi'
import { parseRawModelName } from 'koishi-plugin-chatluna/llm-core/utils/count_tokens'
import { Document } from '@langchain/core/documents'
import { DocumentConfig } from '../types'
import {
    ChatLunaError,
    ChatLunaErrorCode
} from 'koishi-plugin-chatluna/utils/error'
import { VectorStore } from '@langchain/core/vectorstores'
import { DefaultDocumentLoader } from '../llm-core/document_loader'
import { Config, logger } from '..'
import { ChatLunaSaveableVectorStore } from 'koishi-plugin-chatluna/llm-core/model/base'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs/promises'
import { Chain } from '../llm-core/chains/type'
import { MultiScoreThresholdRetriever } from '../llm-core/retrievers/multi_score_threshold'

export class KnowledgeService extends Service {
    private _vectorStores: Record<string, VectorStore> = {}
    private _loader: DefaultDocumentLoader
    private _chains: Record<string, Chain> = {}

    constructor(
        readonly ctx: Context,
        public config: Config
    ) {
        super(ctx, 'chatluna_knowledge')
        defineDatabase(ctx)

        const knowledgeDir = path.join(
            ctx.baseDir,
            'data/chathub/knowledge/default'
        )

        ctx.on('dispose', async () => {
            this._vectorStores = {}
        })

        ctx.on('ready', async () => {
            try {
                await fs.access(knowledgeDir)
            } catch (error) {
                await fs.mkdir(knowledgeDir, { recursive: true })
            }
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

        let result = await selection.execute()

        if (result.length === 0) {
            result = await this.ctx.database
                .select('chathub_knowledge')
                .where({
                    path
                })
                .execute()
        }

        return result[0]
    }

    async deleteDocument(path: string, db?: string) {
        const config = await this._getDocumentConfig(
            path,
            db ?? this.ctx.chatluna.config.defaultVectorStore
        )

        if (config == null) {
            throw new ChatLunaError(
                ChatLunaErrorCode.KNOWLEDGE_VECTOR_NOT_FOUND,
                new Error(`Knowledge vector ${path} from ${db} not found`)
            )
        }

        const vectorStore = await this.createVectorStore(config)

        await vectorStore.delete({ deleteAll: true })

        await this.ctx.database.remove('chathub_knowledge', {
            path
        })

        delete this._vectorStores[config.path]

        this.ctx.emit('chatluna-knowledge/delete', path)
    }

    public async listDocument(db?: string) {
        let selection = this.ctx.database.select('chathub_knowledge')

        if (db != null) {
            selection = selection.where({
                vector_storage: db
            })
        }

        const result = await selection.execute()

        return result
    }

    public async uploadDocument(
        documents: Document[],
        filePath: string,
        name?: string
    ) {
        const existsDocument = await this.ctx.database.get(
            'chathub_knowledge',
            { path: filePath }
        )

        if (existsDocument.length > 0) {
            return
        }

        const id = randomUUID()

        name = name ?? this.extractNameFromPath(filePath)

        const config: DocumentConfig = {
            path: filePath,
            id,
            name,
            vector_storage: this.ctx.chatluna.config.defaultVectorStore,
            embeddings: this.ctx.chatluna.config.defaultEmbeddings
        }

        const vectorStore = await this.createVectorStore(config)

        const chunkDocuments = chunkArray(documents, 60)

        const startTime = performance.now()
        const totalDocs = documents.length
        let completedDocs = 0
        let lastLogTime = startTime

        // Progress logging function
        const logProgress = () => {
            const currentTime = performance.now()
            const elapsed = (currentTime - startTime) / 1000 // Convert to seconds
            const avgTimePerDoc = elapsed / (completedDocs || 1)
            const remaining = (totalDocs - completedDocs) * avgTimePerDoc

            if (currentTime - lastLogTime > 5000) {
                // Log every 5 seconds
                logger.info(
                    `Progress: ${completedDocs}/${totalDocs} documents` +
                        ` (${Math.round((completedDocs / totalDocs) * 100)}%)` +
                        ` | Elapsed: ${Math.round(elapsed)}s` +
                        ` | Est. remaining: ${Math.round(remaining)}s`
                )
                lastLogTime = currentTime
            }
        }

        for (const chunk of chunkDocuments) {
            await vectorStore.addDocuments(chunk)
            completedDocs += chunk.length
            logProgress()
        }

        if (vectorStore instanceof ChatLunaSaveableVectorStore) {
            await vectorStore.save()
        }

        this.ctx.database.upsert('chathub_knowledge', [config])

        this.ctx.emit('chatluna-knowledge/upload', documents, filePath)

        const totalTime = (performance.now() - startTime) / 1000
        logger.info(
            `Upload completed: ${totalDocs} documents in ${Math.round(totalTime)}s`
        )
    }

    private extractNameFromPath(filePath: string): string {
        // 移除开头的 http:// 或 https://
        const cleanPath = filePath.replace(/^(https?:\/\/)/, '')

        // 分割路径并获取最后一个元素
        const parts = cleanPath.split(/[/\\]/)
        return parts[parts.length - 1] || 'unknown'
    }

    getChain(type: string) {
        return this._chains[type]
    }

    clearVectorStore() {
        this._vectorStores = {}
    }

    public get loader() {
        return this._loader
    }

    public get chains() {
        return this._chains
    }

    public createRetriever(vectorStores: VectorStore[]) {
        return MultiScoreThresholdRetriever.fromVectorStores(vectorStores, {
            minSimilarityScore: this.config.minSimilarityScore
        })
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
            embeddings: { type: 'string', length: 254 },
            name: { type: 'string', length: 254 }
        },
        {
            autoInc: false,
            primary: ['path', 'name']
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

declare module 'koishi' {
    interface Events {
        'chatluna-knowledge/upload': (
            documents: Document[],
            path: string
        ) => void
        'chatluna-knowledge/delete': (path: string) => void
    }
}
