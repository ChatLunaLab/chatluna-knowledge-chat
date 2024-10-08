import { SystemPrompts } from 'koishi-plugin-chatluna/llm-core/chain/base'
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model'
import { BasePromptTemplate } from '@langchain/core/prompts'
import { VectorStore, VectorStoreRetriever } from '@langchain/core/vectorstores'

export interface RawKnowledgeConfig {
    query?: RawKnowledgeConfigQuery[]
    name: string
    prompt: string
    chain: string
    path: string
}

export type RawKnowledgeConfigQuery =
    | string
    | { include: string }
    | { regex: string }

export interface DocumentConfig {
    path: string
    id: string
    name: string
    vector_storage: string
    embeddings: string
}

export interface CreateLLMChainParams {
    model: ChatLunaChatModel
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
