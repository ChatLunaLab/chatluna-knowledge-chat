import { Context } from 'koishi'
import { Config } from '.'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'

import { apply as applyFast } from './llm-core/chains/fast'
import { apply as applyRegenerate } from './llm-core/chains/regenerate'
import { apply as applyContextualCompression } from './llm-core/chains/contextual-compression'
import { Chain } from './llm-core/chains/type'

export async function chains(
    ctx: Context,
    plugin: ChatLunaPlugin,
    config: Config
) {
    type Plugin = (
        ctx: Context,
        chains: Record<string, Chain>
    ) => PromiseLike<void> | void

    const plugins: Plugin[] = [
        applyFast,
        applyRegenerate,
        applyContextualCompression
    ]

    for (const apply of plugins) {
        await apply(ctx, ctx.chatluna_knowledge.chains)
    }
}
