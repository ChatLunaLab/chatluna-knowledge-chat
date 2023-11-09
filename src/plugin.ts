import { Context } from 'koishi'
import fs from 'fs/promises'
import { Config } from '.'
import path from 'path'
import { ChatChain } from 'koishi-plugin-chatluna/lib/chains/chain'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/lib/services/chat'

export async function plugins(
    ctx: Context,
    plugin: ChatLunaPlugin,
    config: Config
) {
    const list = await fs.readdir(path.join(__dirname, 'plugins'))

    const chain = ctx.chatluna.chatChain

    for (const file of list) {
        if (file.endsWith('.d.ts')) {
            continue
        }

        const command: {
            apply: (
                ctx: Context,
                config: Config,
                plugin: ChatLunaPlugin,
                chain: ChatChain
            ) => PromiseLike<void> | void
        } = await require(`./plugins/${file}`)

        if (command.apply) {
            await command.apply(ctx, config, plugin, chain)
        }
    }
}
