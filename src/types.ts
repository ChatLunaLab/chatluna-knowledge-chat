export interface RawKnowledgeConfig {
    query?: RawKnowledgeConfigQuery[]
    name: string
    messages: {
        role: string
        content: string
    }[]
    path: string
}

export type RawKnowledgeConfigQuery = string | { include: string } | { regex: string }

export interface KnowledgeConfig {
    path: string
    id: string
    vector_storage: string
    embeddings: string
}

declare module 'koishi' {
    interface Tables {
        chathub_knowledge: KnowledgeConfig
    }
}
