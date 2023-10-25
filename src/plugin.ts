import { Context } from 'koishi'
import fs from 'fs/promises'
import { Config } from '.'
import path from 'path'
import { ChatChain } from '@dingyi222666/koishi-plugin-chathub/lib/chains/chain'
import { ChatHubPlugin } from '@dingyi222666/koishi-plugin-chathub/lib/services/chat'

export async function plugins(
    ctx: Context,
    plugin: ChatHubPlugin,
    config: Config
) {
    const list = await fs.readdir(path.join(__dirname, 'plugins'))

    const chain = ctx.chathub.chatChain

    for (const file of list) {
        if (file.endsWith('.d.ts')) {
            continue
        }

        const command: {
            apply: (
                ctx: Context,
                config: Config,
                plugin: ChatHubPlugin,
                chain: ChatChain
            ) => PromiseLike<void> | void
        } = await require(`./plugins/${file}`)

        if (command.apply) {
            await command.apply(ctx, config, plugin, chain)
        }
    }
}
