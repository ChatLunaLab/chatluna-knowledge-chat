import { ChatChain } from 'koishi-plugin-chatluna/chains'
import { Context, Schema } from 'koishi'
import { Config } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import type {} from 'koishi-plugin-chatluna/llm-core/memory/message'
import { PlatformService } from 'koishi-plugin-chatluna/llm-core/platform/service'
import { ModelType } from 'koishi-plugin-chatluna/llm-core/platform/types'

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
        const documents = await ctx.chatluna_knowledge.listDocument(
            ctx.chatluna.config.defaultVectorStore
        )

        ctx.schema.set(
            'knowledge',
            Schema.union(
                documents
                    .map((document) => Schema.const(document.name))
                    .concat(Schema.const('无'))
            )
        )
    }

    ctx.on('chatluna/model-added', (service) => {
        ctx.schema.set('model', Schema.union(getModelNames(service)))
    })

    ctx.on('chatluna/model-removed', (service) => {
        ctx.schema.set('model', Schema.union(getModelNames(service)))
    })

    ctx.schema.set('model', Schema.union(getModelNames(ctx.chatluna.platform)))

    updateConfig()
}

function getModelNames(service: PlatformService) {
    return service.getAllModels(ModelType.llm).map((m) => Schema.const(m))
}
