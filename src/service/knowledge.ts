import { Context, Service } from 'koishi'
import { parseRawModelName } from 'koishi-plugin-chatluna/llm-core/utils/count_tokens'
import { Document } from '@langchain/core/documents'
import {
    ChatLunaError,
    ChatLunaErrorCode
} from 'koishi-plugin-chatluna/utils/error'
import { DefaultDocumentLoader } from '../document-loader'
import { Config, logger } from 'koishi-plugin-chatluna-knowledge-chat'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs/promises'
import {
    chunkArray,
    createHippoRAGConfig,
    createLightRAGConfig,
    createStandardRAGConfig
} from '../utils'
import {
    AddDocumentsOptions,
    BaseRAGRetriever,
    DeleteDocumentsOptions,
    RAGRetrieverType,
    RetrieverConfig
} from 'koishi-plugin-chatluna-vector-store-service'
import { ComputedRef } from 'koishi-plugin-chatluna'

export class KnowledgeService extends Service {
    private _ragRetrievers: Record<string, ComputedRef<BaseRAGRetriever>> = {}

    private _loader: DefaultDocumentLoader

    constructor(
        readonly ctx: Context,
        public config: Config
    ) {
        super(ctx, 'chatluna_knowledge')
        defineDatabase(ctx)

        const knowledgeDir = path.join(ctx.baseDir, 'data/chathub/knowledge')

        ctx.on('dispose', async () => {
            // Dispose all RAG retrievers
            for (const retriever of Object.values(this._ragRetrievers)) {
                await retriever.value.dispose()
            }
            this._ragRetrievers = {}
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

    /**
     * Create a new knowledge base
     */
    async createKnowledgeBase(
        name: string,
        ragType: RAGRetrieverType = 'standard',
        options?: {
            description?: string
            embeddings?: string
            ragConfig?: RetrieverConfig
        }
    ): Promise<string> {
        const id = randomUUID()

        const embeddingsName =
            options?.embeddings ?? this.ctx.chatluna.config.defaultEmbeddings

        const embeddingsModel =
            await this.ctx.chatluna.createEmbeddings(embeddingsName)

        if (!embeddingsModel) {
            throw new ChatLunaError(
                ChatLunaErrorCode.EMBEDDINGS_INIT_ERROR,
                new Error(`Embeddings model ${embeddingsName} not found`)
            )
        }

        const config: DocumentConfig = {
            id,
            name,
            ragType,
            embeddings: embeddingsName,
            description: options?.description,
            ragConfig: options?.ragConfig
        }

        await this.ctx.database.upsert('chatluna_knowledge', [config])

        logger.info(`Created knowledge base: ${name} (${id})`)
        return id
    }

    /**
     * Delete a knowledge base and all its documents
     */
    async deleteKnowledgeBase(idOrName: string): Promise<void> {
        const config = await this.getDocumentConfig(idOrName)

        if (!config) {
            throw new ChatLunaError(
                ChatLunaErrorCode.KNOWLEDGE_CONFIG_INVALID,
                new Error(`Knowledge base ${idOrName} not found`)
            )
        }

        // Get RAG retriever and delete all documents
        const retriever = await this.getRAGRetriever(config.id)
        await retriever.value.deleteDocuments({ deleteAll: true })

        // Remove from database
        await this.ctx.database.remove('chatluna_knowledge', {
            id: config.id
        })

        // Clean up cache
        delete this._ragRetrievers[config.id]

        logger.info(`Deleted knowledge base: ${config.name} (${config.id})`)
        this.ctx.emit('chatluna-knowledge/delete-kb', config.id, config.name)
    }

    /**
     * Create or get RAG retriever for a knowledge base
     */
    async createRAGRetriever(documentConfig: DocumentConfig) {
        const {
            id,
            ragType,
            embeddings: embeddingsName,
            ragConfig
        } = documentConfig

        if (this._ragRetrievers[id]) {
            return this._ragRetrievers[id]
        }

        const embeddings = await this.ctx.chatluna.createEmbeddings(
            ...parseRawModelName(embeddingsName)
        )

        // Create base config
        let config: RetrieverConfig = {
            embeddings: embeddings.value,
            vectorStoreKey: id,
            maxResults: this.config.topK,
            ...ragConfig
        }

        // Apply RAG-specific configurations
        if (ragType === 'standard') {
            const llm = this.config.standardModel
                ? await this.ctx.chatluna.createChatModel(
                      this.config.standardModel
                  )
                : await this.ctx.chatluna.createChatModel(
                      this.ctx.chatluna.config.defaultModel
                  )

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config = createStandardRAGConfig(this.config, config, llm as any)
        } else if (ragType === 'hippo_rag') {
            const llm = this.config.hippoModel
                ? await this.ctx.chatluna.createChatModel(
                      this.config.hippoModel
                  )
                : await this.ctx.chatluna.createChatModel(
                      this.ctx.chatluna.config.defaultModel
                  )

            config = createHippoRAGConfig(
                this.ctx,
                this.config,
                config,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                llm as any
            )
        } else if (ragType === 'light_rag') {
            const llm = this.config.standardModel
                ? await this.ctx.chatluna.createChatModel(
                      this.config.standardModel
                  )
                : undefined

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config = createLightRAGConfig(this.config, config, llm as any)
        }

        const retriever = await this.ctx.chatluna_rag.createRAGRetriever(
            ragType,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config as any
        )

        this._ragRetrievers[id] = retriever

        return retriever
    }

    /**
     * Get RAG retriever by knowledge base ID or name
     */
    async getRAGRetriever(idOrName: string) {
        // Try direct lookup by ID first
        if (this._ragRetrievers[idOrName]) {
            return this._ragRetrievers[idOrName]
        }

        const config = await this.getDocumentConfig(idOrName)

        if (!config) {
            throw new ChatLunaError(
                ChatLunaErrorCode.KNOWLEDGE_CONFIG_INVALID,
                new Error(`Knowledge base ${idOrName} not found`)
            )
        }

        return await this.createRAGRetriever(config)
    }

    async getDocumentConfig(idOrName: string): Promise<DocumentConfig | null> {
        // Try by ID first
        let result = await this.ctx.database
            .select('chatluna_knowledge')
            .where({ id: idOrName })
            .execute()

        if (result.length === 0) {
            // Try by name
            result = await this.ctx.database
                .select('chatluna_knowledge')
                .where({ name: idOrName })
                .execute()
        }

        return result[0] || null
    }

    /**
     * Delete documents from a knowledge base
     */
    async deleteDocument(
        knowledgeBaseId: string,
        documentIds?: string[]
    ): Promise<void> {
        const retriever = await this.getRAGRetriever(knowledgeBaseId)

        const options: DeleteDocumentsOptions = documentIds
            ? { ids: documentIds }
            : { deleteAll: true }

        await retriever.value.deleteDocuments(options)

        this.ctx.emit('chatluna-knowledge/delete', knowledgeBaseId, documentIds)
    }

    /**
     * List all knowledge bases
     */
    public async listKnowledgeBases(): Promise<DocumentConfig[]> {
        const result = await this.ctx.database
            .select('chatluna_knowledge')
            .execute()

        return result
    }

    /**
     * List documents in a knowledge base
     */
    public async listDocuments(knowledgeBaseId: string): Promise<Document[]> {
        const retriever = await this.getRAGRetriever(knowledgeBaseId)
        return await retriever.value.listDocuments()
    }

    /**
     * Upload documents to a knowledge base
     */
    public async uploadDocument(
        knowledgeBaseId: string,
        documents: Document[],
        options?: AddDocumentsOptions
    ): Promise<string[]> {
        const retriever = await this.getRAGRetriever(knowledgeBaseId)

        // Initialize retriever if needed
        await retriever.value.initialize()

        const chunkDocuments = chunkArray(documents, 60)

        const startTime = performance.now()
        const totalDocs = documents.length
        let completedDocs = 0
        let lastLogTime = startTime

        const allIds: string[] = []

        // Progress logging function
        const logProgress = () => {
            const currentTime = performance.now()
            const elapsed = (currentTime - startTime) / 1000
            const avgTimePerDoc = elapsed / (completedDocs || 1)
            const remaining = (totalDocs - completedDocs) * avgTimePerDoc

            if (currentTime - lastLogTime > 5000) {
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
            const ids = await retriever.value.addDocuments(chunk, options)
            allIds.push(...ids)
            completedDocs += chunk.length
            logProgress()
        }

        this.ctx.emit('chatluna-knowledge/upload', documents, knowledgeBaseId)

        const totalTime = (performance.now() - startTime) / 1000
        logger.info(
            `Upload completed: ${totalDocs} documents in ${Math.round(totalTime)}s`
        )

        return allIds
    }

    /**
     * Search for similar documents in a knowledge base
     */
    public async similaritySearch(
        knowledgeBaseId: string,
        query: string,
        options?: { k?: number; threshold?: number }
    ): Promise<Document[]> {
        const retriever = await this.getRAGRetriever(knowledgeBaseId)
        return await retriever.value.similaritySearch(query, options)
    }

    /**
     * Get statistics for a knowledge base
     */
    public async getKnowledgeBaseStats(knowledgeBaseId: string) {
        const retriever = await this.getRAGRetriever(knowledgeBaseId)
        return await retriever.value.getStats()
    }

    public get loader() {
        return this._loader
    }

    public clearCache() {
        this._ragRetrievers = {}
    }

    static inject = ['database', 'chatluna_rag']
}

function defineDatabase(ctx: Context) {
    ctx.database.extend(
        'chatluna_knowledge',
        {
            id: { type: 'string' },
            name: { type: 'string' },
            ragType: { type: 'string' },
            embeddings: { type: 'string' },
            description: { type: 'text' },
            ragConfig: { type: 'json' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' }
        },
        {
            autoInc: false,
            primary: ['id']
        }
    )
}

export interface DocumentConfig {
    id: string
    name: string
    ragType: RAGRetrieverType
    embeddings: string
    description?: string
    ragConfig?: RetrieverConfig
    createdAt?: Date
    updatedAt?: Date
}

declare module 'koishi' {
    interface Events {
        'chatluna-knowledge/upload': (
            documents: Document[],
            knowledgeBaseId: string
        ) => void
        'chatluna-knowledge/delete': (
            knowledgeBaseId: string,
            documentIds?: string[]
        ) => void
        'chatluna-knowledge/delete-kb': (
            knowledgeBaseId: string,
            name: string
        ) => void
    }
    interface Context {
        chatluna_knowledge: KnowledgeService
    }

    interface Tables {
        chatluna_knowledge: DocumentConfig
    }
}
