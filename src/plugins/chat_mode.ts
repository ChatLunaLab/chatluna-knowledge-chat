import { ChatChain } from '@dingyi222666/koishi-plugin-chathub/lib/chains/chain'
import { Context } from 'koishi'
import { Config, knowledgeConfigService, knowledgeService } from '..'
import { ChatHubPlugin } from '@dingyi222666/koishi-plugin-chathub/lib/services/chat'
import { CreateChatHubLLMChainParams } from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/platform/types'
import { ChatHubWrapperChain } from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/chain/wrapper_chain'
import { KoishiDataBaseChatMessageHistory } from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/memory/message/database_memory'
import { VectorStore } from 'langchain/vectorstores/base'
import { MultiScoreThresholdRetriever } from '../llm-core/retrievers/multi_score_threshold'
import { ConversationalFastRetrievalQAChain } from '../llm-core/chains/fast'
import { PromptTemplate } from 'langchain/prompts'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatHubPlugin,
    chain: ChatChain
): Promise<void> {
    await plugin.registerChatChainProvider('knowledge-chat', '知识库问答', async (params) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const chain = await loadChain(ctx, config, params)

        return ChatHubWrapperChain.fromLLM(params.model, {
            historyMemory: params.historyMemory,
            chain,
            inputKey: 'question'
        })
    })
}

async function loadChain(ctx: Context, config: Config, param: CreateChatHubLLMChainParams) {
    if (config.mode === 'default') {
        return loadDefaultChain(ctx, config, param)
    }
}

async function loadDefaultChain(ctx: Context, config: Config, params: CreateChatHubLLMChainParams) {
    const knowledgeId = await getKnowledgeId(ctx, config, params)

    const rawKnowledge = await knowledgeConfigService.getConfig(knowledgeId)

    const vectorStores = await knowledgeService.loadConfig(rawKnowledge)

    const retriever = createRetriever(ctx, config, vectorStores)

    const prompt =
        rawKnowledge.prompt != null ? PromptTemplate.fromTemplate(rawKnowledge.prompt) : undefined

    return ConversationalFastRetrievalQAChain.fromLLM(params.model, retriever, {
        qaChainOptions: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: (rawKnowledge.chain as any | null) ?? 'stuff',
            prompt,
            questionPrompt: prompt,
            combinePrompt: prompt
        },
        systemPrompts: params.systemPrompt
    })
}

async function getKnowledgeId(ctx: Context, config: Config, params: CreateChatHubLLMChainParams) {
    const chatHistory = params.historyMemory.chatHistory as KoishiDataBaseChatMessageHistory

    const rawKnowledgeId =
        (await chatHistory.getAdditionalKwargs('knowledgeId')) ?? config.defaultConfig

    await chatHistory.updateAdditionalKwargs('knowledgeId', rawKnowledgeId)

    return rawKnowledgeId
}

function createRetriever(ctx: Context, config: Config, vectorStores: VectorStore[]) {
    return MultiScoreThresholdRetriever.fromVectorStores(vectorStores, {
        minSimilarityScore: config.minSimilarityScore
    })
}
