import { ChatChain } from 'koishi-plugin-chatluna/chains'
import { Context } from 'koishi'
import { Config } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import type {} from 'koishi-plugin-chatluna/llm-core/memory/message'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin,
    chain: ChatChain
): Promise<void> {}
