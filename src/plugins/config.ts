import { ChatChain } from 'koishi-plugin-chatluna/chains'
import { Context, Schema } from 'koishi'
import { Config } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import type {} from 'koishi-plugin-chatluna/llm-core/memory/message'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin,
    chain: ChatChain
): Promise<void> {
    ctx.on('chatluna-knowledge/delete', async (data) => {
        await updateConfig()
    })

    ctx.on('chatluna-knowledge/upload', async (data) => {
        await updateConfig()
    })

    ctx.on('chatluna-knowledge/list', async (data) => {
        await updateConfig()
    })

    async function updateConfig() {
        const documents = await ctx.chatluna_knowledge.listDocument(
            ctx.chatluna.config.defaultVectorStore
        )

        ctx.schema.set(
            'chatluna_knowledge',
            Schema.union(
                documents.map((document) => Schema.const(document.name))
            )
        )
    }
}
