import { SystemPrompts } from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/chain/base'
import { ChatHubChatModel } from '@dingyi222666/koishi-plugin-chathub/lib/llm-core/platform/model'
import { BasePromptTemplate } from 'langchain/prompts'
import { VectorStore, VectorStoreRetriever } from 'langchain/vectorstores/base'

export interface RawKnowledgeConfig {
    query?: RawKnowledgeConfigQuery[]
    name: string
    prompt: string
    chain: string
    path: string
}

export type RawKnowledgeConfigQuery = string | { include: string } | { regex: string }

export interface DocumentConfig {
    path: string
    id: string
    vector_storage: string
    embeddings: string
}

export interface CreateLLMChainParams {
    model: ChatHubChatModel
    knowledgeId: string
    rawKnowledge: RawKnowledgeConfig
    vectorStores: VectorStore[]
    retriever: VectorStoreRetriever
    prompt: BasePromptTemplate
    systemPrompt: SystemPrompts
}

declare module 'koishi' {
    interface Tables {
        chathub_knowledge: DocumentConfig
    }
}
