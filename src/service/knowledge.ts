import { Context, Schema } from 'koishi'
import { createLogger } from '@dingyi222666/koishi-plugin-chathub/lib/utils/logger'
import { parseRawModelName } from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/utils/count_tokens'
import path from 'path'
import { Document } from 'langchain/document'
import fs from 'fs/promises'
import { load } from 'js-yaml'
import { KnowledgeConfig, RawKnowledgeConfig, RawKnowledgeConfigQuery } from '../types'
import { ChatHubError, ChatHubErrorCode } from '@dingyi222666/koishi-plugin-chathub/lib/utils/error'
import { VectorStore } from 'langchain/vectorstores/base'
import { DefaultDocumentLoader } from '../llm-core/document_loader'
import { Config } from '..'
import { ChatHubSaveableVectorStore } from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/model/base'
import { randomUUID } from 'crypto'

const logger = createLogger('chathub-knowledge-chat')

export class KnowledgeConfigService {
    private readonly _knowledgeConfig: RawKnowledgeConfig[] = []

    constructor(private readonly ctx: Context) {}

    async loadAllConfig() {
        await this._checkConfigDir()

        const presetDir = this.resolveConfigDir()
        const files = await fs.readdir(presetDir)
        const dataDir = path.resolve(this.ctx.baseDir, 'data/chathub/knowledge/data')

        this._knowledgeConfig.length = 0

        for (const file of files) {
            // use file

            const rawText = await fs.readFile(path.join(presetDir, file), 'utf-8')
            const preset = loadKnowledgeConfig(rawText)
            preset.path = path.join(presetDir, file)

            this._knowledgeConfig.push(preset)
        }

        for (const knowledge of this._knowledgeConfig) {
            const query = knowledge.query

            if (query == null) {
                knowledge.query = await this._asQuery(dataDir)

                continue
            }

            knowledge.query = await this._parseQuery(query, dataDir, 0)
        }

        this.ctx.schema.set(
            'knowledge-config',
            Schema.union(this._knowledgeConfig.map((config) => Schema.const(config.name)))
        )
    }

    async getConfig(
        triggerKeyword: string,
        loadForDisk: boolean = true,
        throwError: boolean = true
    ): Promise<RawKnowledgeConfig> {
        if (loadForDisk) {
            // always load for disk
            await this.loadAllConfig()
        }

        const preset = this._knowledgeConfig.find((preset) => preset.name === triggerKeyword)

        if (preset) {
            return preset
        }

        if (throwError) {
            throw new Error(`No preset found for keyword ${triggerKeyword}`)
        }

        return null
    }

    async getAllConfig(): Promise<string[]> {
        await this.loadAllConfig()

        return this._knowledgeConfig.map((preset) => preset.name)
    }

    public resolveConfigDir() {
        return path.resolve(this.ctx.baseDir, 'data/chathub/knowledge/config')
    }

    private async _checkConfigDir() {
        const presetDir = path.join(this.resolveConfigDir())

        // check if preset dir exists
        try {
            await fs.access(presetDir)
        } catch (err) {
            if (err.code === 'ENOENT') {
                await fs.mkdir(presetDir, { recursive: true })
                await this._copyDefaultConfig()
            } else {
                throw err
            }
        }
    }

    private async _asQuery(dir: string) {
        try {
            const files = await fs.readdir(dir, { withFileTypes: true })

            return files.map((file) => file.path)
        } catch (err) {
            return []
        }
    }

    private async _parseQuery(query: RawKnowledgeConfigQuery[], dataDir: string, level: number) {
        if (level > 10) {
            throw new ChatHubError(ChatHubErrorCode.KNOWLEDGE_LOOP_INCLUDE)
        }

        const result: RawKnowledgeConfigQuery[] = []

        for (const item of query) {
            if (typeof item === 'string') {
                console.log(item)
                result.push(await this._loadDocPath(dataDir, item))
                continue
            } else if ('include' in item) {
                const config = await this.getConfig(item.include, false, true)
                const sub = await this._parseQuery(config.query, dataDir, level + 1)

                result.push(...sub)
            } else {
                result.push(...(await this._filterDoc(dataDir, item.regex)))
            }
        }

        return result
    }

    private async _filterDoc(dataDir: string, rawRegex: string) {
        const files = await this._asQuery(dataDir)

        const regex = new RegExp(rawRegex)

        const result: string[] = []

        for (const file of files) {
            if (regex.test(file)) {
                result.push(file)
            }
        }

        return result
    }

    private async _loadDocPath(dir: string, name: string) {
        let fileStat = await fs.stat(path.join(dir, name))

        if (fileStat.isFile()) {
            return path.join(dir, name)
        }

        fileStat = await fs.stat(name)

        if (fileStat.isFile()) {
            return name
        }

        throw new ChatHubError(ChatHubErrorCode.KNOWLEDGE_DOC_NOT_FOUND)
    }

    private async _copyDefaultConfig() {
        const currentPresetDir = path.join(this.resolveConfigDir())

        const defaultPresetDir = path.join(__dirname, '../../resources')

        const files = await fs.readdir(defaultPresetDir)

        for (const file of files) {
            const filePath = path.join(defaultPresetDir, file)
            const fileStat = await fs.stat(filePath)
            if (fileStat.isFile()) {
                await fs.mkdir(currentPresetDir, { recursive: true })
                logger.debug(`copy knowledge config file ${filePath} to ${currentPresetDir}`)
                await fs.copyFile(filePath, path.join(currentPresetDir, file))
            }
        }
    }
}

export class KnowledgeService {
    private _vectorStores: Record<string, VectorStore> = {}
    private _loader: DefaultDocumentLoader

    constructor(
        private readonly ctx: Context,
        private readonly config: Config,
        private readonly configService: KnowledgeConfigService
    ) {
        defineDatabase(ctx)

        ctx.on('dispose', async () => {
            this._vectorStores = {}
        })

        this._loader = new DefaultDocumentLoader(ctx, config)
    }

    async createVectorStore(knowledgeConfig: KnowledgeConfig) {
        const {
            path,
            id,
            vector_storage: vectorStorage,
            embeddings: embeddingsName
        } = knowledgeConfig

        if (this._vectorStores[path]) {
            return this._vectorStores[path]
        }

        const embeddings = await this.ctx.chathub.createEmbeddings(
            ...parseRawModelName(embeddingsName)
        )

        const vectorStore = await this.ctx.chathub.platform.createVectorStore(vectorStorage, {
            key: id,
            embeddings
        })

        this._vectorStores[path] = vectorStore

        return vectorStore
    }

    async loadVectorStore(path: string) {
        if (this._vectorStores[path]) {
            return this._vectorStores[path]
        }

        const config = (
            await this.ctx.database.get('chathub_knowledge', {
                path
            })
        )?.[0]

        if (!config) {
            throw new ChatHubError(
                ChatHubErrorCode.KNOWLEDGE_CONFIG_INVALID,
                new Error(`Knowledge config ${path} not found`)
            )
        }

        const vectorStore = await this.createVectorStore(config)

        return vectorStore
    }

    public async uploadDocument(documents: Document[], path: string) {
        const existsDocument = await this.ctx.database.get('chathub_knowledge', { path })

        if (existsDocument.length > 0) {
            return
        }

        const id = randomUUID()

        const config: KnowledgeConfig = {
            path,
            id,
            vector_storage: this.ctx.chathub.config.defaultVectorStore,
            embeddings: this.ctx.chathub.config.defaultEmbeddings
        }

        const vectorStore = await this.createVectorStore(config)

        await vectorStore.addDocuments(documents)

        if (vectorStore instanceof ChatHubSaveableVectorStore) {
            await vectorStore.save()
        }

        this.ctx.database.upsert('chathub_knowledge', [config])
    }

    public get loader() {
        return this._loader
    }
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

export function loadKnowledgeConfig(text: string) {
    const config = load(text) as RawKnowledgeConfig

    if (config.messages == null || config.name == null) {
        throw new ChatHubError(ChatHubErrorCode.KNOWLEDGE_CONFIG_INVALID)
    }

    return config
}
