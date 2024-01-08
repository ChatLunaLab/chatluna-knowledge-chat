import { ChatChain } from 'koishi-plugin-chatluna/lib/chains/chain'
import { Context } from 'koishi'
import { Config } from '..'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/lib/services/chat'
import { CreateChatHubLLMChainParams } from 'koishi-plugin-chatluna/lib/llm-core/platform/types'
import { ChatHubWrapperChain } from 'koishi-plugin-chatluna/lib/llm-core/chain/wrapper_chain'
import { KoishiChatMessageHistory } from 'koishi-plugin-chatluna/lib/llm-core/memory/message/database_memory'
import { VectorStore } from '@langchain/core/vectorstores'
import { MultiScoreThresholdRetriever } from '../llm-core/retrievers/multi_score_threshold'
import { ConversationalFastRetrievalQAChain } from '../llm-core/chains/fast'
import { PromptTemplate } from '@langchain/core/prompts'
import { ConversationalRetrievalQAChain } from '../llm-core/chains/regenerate'
import { CreateLLMChainParams } from '../types'
import { ConversationalContextualCompressionRetrievalQAChain } from '../llm-core/chains/contextual-compression'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatLunaPlugin,
    chain: ChatChain
): Promise<void> {
    await plugin.registerChatChainProvider(
        'knowledge-chat',
        '知识库问答',
        async (params) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const chain = await loadChain(ctx, config, params)

            return ChatHubWrapperChain.fromLLM(params.model, {
                historyMemory: params.historyMemory,
                chain,
                inputKey: 'question'
            })
        }
    )
}

async function loadChain(
    ctx: Context,
    config: Config,
    params: CreateChatHubLLMChainParams
) {
    const knowledgeId = await getKnowledgeId(ctx, config, params)

    const rawKnowledge =
        await ctx.chatluna_knowledge_config.getConfig(knowledgeId)

    const vectorStores = await ctx.chatluna_knowledge.loadConfig(rawKnowledge)

    const retriever = createRetriever(ctx, config, vectorStores)

    const prompt =
        rawKnowledge.prompt != null
            ? PromptTemplate.fromTemplate(rawKnowledge.prompt)
            : undefined

    const createParams: CreateLLMChainParams = {
        prompt,
        retriever,
        vectorStores,
        rawKnowledge,
        knowledgeId,
        systemPrompt: params.systemPrompt,
        model: params.model
    }

    if (config.mode === 'default') {
        return loadDefaultChain(createParams)
    } else if (config.mode === 'regenerate') {
        return loadRegenerateChain(createParams)
    } else if (config.mode === 'contextual-compression') {
        return loadContextualCompressionChain(createParams)
    }
}

async function loadDefaultChain(params: CreateLLMChainParams) {
    return ConversationalFastRetrievalQAChain.fromLLM(
        params.model,
        params.retriever,
        {
            qaChainOptions: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: (params.rawKnowledge.chain as any | null) ?? 'stuff',
                prompt: params.prompt,
                questionPrompt: params.prompt,
                combinePrompt: params.prompt
            },
            systemPrompts: params.systemPrompt
        }
    )
}

async function loadContextualCompressionChain(params: CreateLLMChainParams) {
    return ConversationalContextualCompressionRetrievalQAChain.fromLLM(
        params.model,
        params.retriever,
        {
            qaChainOptions: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: (params.rawKnowledge.chain as any | null) ?? 'stuff',
                prompt: params.prompt,
                questionPrompt: params.prompt,
                combinePrompt: params.prompt
            },
            systemPrompts: params.systemPrompt
        }
    )
}

async function loadRegenerateChain(params: CreateLLMChainParams) {
    return ConversationalRetrievalQAChain.fromLLM(
        params.model,
        params.retriever,
        {
            qaChainOptions: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: (params.rawKnowledge.chain as any | null) ?? 'stuff',
                prompt: params.prompt,
                questionPrompt: params.prompt,
                combinePrompt: params.prompt
            },
            systemPrompts: params.systemPrompt
        }
    )
}

async function getKnowledgeId(
    ctx: Context,
    config: Config,
    params: CreateChatHubLLMChainParams
) {
    const chatHistory = params.historyMemory
        .chatHistory as KoishiChatMessageHistory

    const rawKnowledgeId =
        (await chatHistory.getAdditionalKwargs('knowledgeId')) ??
        config.defaultConfig

    await chatHistory.updateAdditionalKwargs('knowledgeId', rawKnowledgeId)

    return rawKnowledgeId
}

function createRetriever(
    ctx: Context,
    config: Config,
    vectorStores: VectorStore[]
) {
    return MultiScoreThresholdRetriever.fromVectorStores(vectorStores, {
        minSimilarityScore: config.minSimilarityScore
    })
}
