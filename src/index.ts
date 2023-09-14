import { Context, Schema } from 'koishi'

import { ChatHubPlugin } from '@dingyi222666/koishi-plugin-chathub/lib/services/chat'
import { plugins } from './plugin'
import { KnowledgeConfigService } from './service/knowledge'

export let knowledgeConfigService: KnowledgeConfigService

export function apply(ctx: Context, config: Config) {
    const plugin = new ChatHubPlugin(ctx, config, 'knowledge-chat')

    ctx.on('ready', async () => {
        knowledgeConfigService = new KnowledgeConfigService(ctx)

        await plugin.registerToService()

        await knowledgeConfigService.loadAllConfig()

        await plugins(ctx, plugin, config)
    })

    ctx.on('dispose', async () => {
        knowledgeConfigService = null
    })
}

export const name = '@dingyi222666/chathub-knowledge-chat'

export interface Config extends ChatHubPlugin.Config {
    defaultConfig: string
    chunkSize: number
    chunkOverlap: number
    mode: string
}

export const Config = Schema.intersect([
    Schema.object({
        defaultConfig: Schema.dynamic('knowledge-config')
            .default('default')
            .description('默认的知识库配置文件'),
        chunkSize: Schema.number()
            .default(500)
            .max(200)
            .min(2000)
            .description('文本块的切割大小（字符）'),
        chunkOverlap: Schema.number()
            .default(0)
            .max(200)
            .min(0)
            .description(
                '文本块之间的最大重叠量（字体）。保留一些重叠可以保持文本块之间的连续性。'
            ),
        mode: Schema.union([
            Schema.const('default').description('直接对问题查询'),
            Schema.const('regenerate').description('重新生成问题查询'),
            Schema.const('contextual-compression').description('上下文压缩查询')
        ]).description('知识库运行模式')
    }).description('基础配置')
])

export const using = ['chathub']
