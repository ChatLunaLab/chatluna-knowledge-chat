import { Context } from 'koishi'
import { Config } from '.'
import { ChatChain } from 'koishi-plugin-chatluna/chains'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'

import { apply as applyCommand } from './plugins/command'
import { apply as applyConfig } from './plugins/config'
import { apply as applyChat } from './plugins/chat'

export async function plugins(
    ctx: Context,
    plugin: ChatLunaPlugin,
    config: Config
) {
    const chain = ctx.chatluna.chatChain

    type Plugin = (
        ctx: Context,
        config: Config,
        plugin: ChatLunaPlugin,
        chain: ChatChain
    ) => PromiseLike<void> | void

    const plugins: Plugin[] =
        // plugin start
        [applyCommand, applyConfig, applyChat] // plugin end

    for (const apply of plugins) {
        await apply(ctx, config, plugin, chain)
    }
}
