import { Context, Schema } from 'koishi'
import { createLogger } from '@dingyi222666/koishi-plugin-chathub/lib/utils/logger'
import path from 'path'
import fs from 'fs/promises'
import { load } from 'js-yaml'
import { RawKnowledgeConfig } from '../types'
import { ChatHubError, ChatHubErrorCode } from '@dingyi222666/koishi-plugin-chathub/lib/utils/error'

const logger = createLogger('chathub-knowledge-chat')

export class KnowledgeConfigService {
    private readonly _knowledgeConfig: RawKnowledgeConfig[] = []

    constructor(private readonly ctx: Context) {}

    async loadAllConfig() {
        await this._checkConfigDir()

        const presetDir = this.resolveConfigDir()
        const files = await fs.readdir(presetDir)

        this._knowledgeConfig.length = 0

        for (const file of files) {
            // use file

            const rawText = await fs.readFile(path.join(presetDir, file), 'utf-8')
            const preset = loadKnowledgeConfig(rawText)

            this._knowledgeConfig.push(preset)
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

export function loadKnowledgeConfig(text: string) {
    const config = load(text) as RawKnowledgeConfig

    logger.debug(JSON.stringify(config))

    if (config.messages == null || config.name == null) {
        throw new ChatHubError(ChatHubErrorCode.KNOWLEDGE_CONFIG_INVALID)
    }

    return config
}
