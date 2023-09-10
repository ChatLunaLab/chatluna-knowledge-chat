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

        await plugins(ctx, config)
    })

    ctx.on('dispose', async () => {
        knowledgeConfigService = null
    })
}

export const name = '@dingyi222666/chathub-knowledge-chat'

export interface Config extends ChatHubPlugin.Config {
    defaultConfig: string
}

export const Config = Schema.intersect([
    Schema.object({
        defaultConfig: Schema.dynamic('knowledge-config')
            .default('default')
            .description('默认的知识库配置文件')
    }).description('基础配置')
])

export const using = ['chathub']
