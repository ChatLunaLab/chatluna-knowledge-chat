import { Context, Logger } from 'koishi'

import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import { plugins } from './plugin'
import { KnowledgeService } from './service/knowledge'
import { createLogger } from 'koishi-plugin-chatluna/utils/logger'
import { Config } from './config'

export let logger: Logger

export function apply(ctx: Context, config: Config) {
    const plugin = new ChatLunaPlugin(ctx, config, 'knowledge-chat', false)
    logger = createLogger(ctx, 'chatluna-knowledge-chat')

    ctx.plugin(KnowledgeService, config)

    const pluginEntryPoint = async (ctx: Context) => {
        await ctx.chatluna_knowledge.loader.init()

        await plugins(ctx, plugin, config)
    }

    ctx.plugin(
        {
            apply: (ctx: Context, config: Config) => {
                ctx.on('ready', async () => {
                    await pluginEntryPoint(ctx)
                })
            },
            inject: ['chatluna', 'chatluna_knowledge'],
            name: 'chatluna_knowledge_entry_point'
        },
        config
    )
}

export const name = 'chatluna-knowledge-chat'
export * from './service/knowledge'
export * from './config'
