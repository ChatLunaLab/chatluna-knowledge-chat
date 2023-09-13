import { Context, Schema } from 'koishi'
import { createLogger } from '@dingyi222666/koishi-plugin-chathub/lib/utils/logger'
import path from 'path'
import fs from 'fs/promises'
import { load } from 'js-yaml'
import { RawKnowledgeConfig } from '../types'
import { ChatHubError, ChatHubErrorCode } from '@dingyi222666/koishi-plugin-chathub/lib/utils/error'
import { VectorStore } from 'langchain/vectorstores/base'
import { Embeddings } from 'langchain/embeddings/base'

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

        for (const configKey in this._knowledgeConfig) {
            const query = this._knowledgeConfig[configKey].query

            if (query == null) {
                this._knowledgeConfig[configKey].query = await this._asQuery(dataDir)

                continue
            }

            this._knowledgeConfig[configKey].query = await this._parseQuery(query, dataDir, 0)
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
        const files = await fs.readdir(dir)

        return files.map((file) => path.join(dir, file))
    }

    private async _parseQuery(
        query: (string | { include: string })[],
        dataDir: string,
        level: number
    ) {
        if (level > 10) {
            throw new ChatHubError(ChatHubErrorCode.KNOWLEDGE_LOOP_INCLUDE)
        }

        const result: (string | { include: string })[] = []

        for (const item of query) {
            if (typeof item === 'string') {
                result.push(await this._loadDocPath(dataDir, item))
            } else {
                const config = await this.getConfig(item.include, false, true)
                const sub = await this._parseQuery(config.query, dataDir, level + 1)

                result.push(...sub)
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

    constructor(
        private readonly ctx: Context,
        private readonly configService: KnowledgeConfigService
    ) {
        defineDatabase(ctx)

        ctx.on('dispose', async () => {
            this._vectorStores = {}
        })
    }

    public async loadVectorStore(name: string, embeddings: Embeddings) {
        if (this._vectorStores[name]) {
            return this._vectorStores[name]
        }

        const rawConfig = await this.configService.getConfig(name)

        const config = (
            await this.ctx.database.get('chathub_knowledge', {
                path: rawConfig.path
            })
        )?.[0]

        if (!config) {
            throw new ChatHubError(
                ChatHubErrorCode.KNOWLEDGE_CONFIG_INVALID,
                new Error(`Knowledge vector store ${name} not found`)
            )
        }

        const vectorStore = await this.ctx.chathub.platform.createVectorStore(
            config.vector_storage,
            {
                key: config.id,
                embeddings
            }
        )

        return vectorStore
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

    logger.debug(JSON.stringify(config))

    if (config.messages == null || config.name == null) {
        throw new ChatHubError(ChatHubErrorCode.KNOWLEDGE_CONFIG_INVALID)
    }

    return config
}
