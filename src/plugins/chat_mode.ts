import { ChatChain } from '@dingyi222666/koishi-plugin-chathub/lib/chains/chain'
import { Context } from 'koishi'
import { Config } from '..'
import { ChatHubPlugin } from '@dingyi222666/koishi-plugin-chathub/lib/services/chat'
import { CreateChatHubLLMChainParams } from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/platform/types'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatHubPlugin,
    chain: ChatChain
): Promise<void> {
    ctx.chathub.platform.registerChatChain('knowledge-chat', '知识库问答', async (params) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _ = await loadChain(ctx, config, params)
        throw new Error('not implemented')
    })
}

async function loadChain(ctx: Context, config: Config, param: CreateChatHubLLMChainParams) {
    if (config.mode === 'default') {
        return loadDefaultChain(ctx, config, param)
    }
}

async function loadDefaultChain(ctx: Context, config: Config, param: CreateChatHubLLMChainParams) {}
