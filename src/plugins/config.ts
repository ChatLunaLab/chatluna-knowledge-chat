import { ChatChain } from 'koishi-plugin-chatluna/chains'
import { Context, Schema } from 'koishi'
import { Config } from 'koishi-plugin-chatluna-knowledge-chat'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import type {} from 'koishi-plugin-chatluna/llm-core/memory/message'
import { modelSchema } from 'koishi-plugin-chatluna/utils/schema'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin,
    chain: ChatChain
): Promise<void> {
    ctx.on('chatluna-knowledge/delete', (data) => {
        updateConfig()
    })

    ctx.on('chatluna-knowledge/upload', (data) => {
        updateConfig()
    })

    async function updateConfig() {
        const documents = await ctx.chatluna_knowledge.listKnowledgeBases()

        ctx.schema.set(
            'knowledge',
            Schema.union(
                documents
                    .map((document) => Schema.const(document.name))
                    .concat(Schema.const('无'))
            )
        )
    }

    updateConfig()

    modelSchema(ctx)
}
