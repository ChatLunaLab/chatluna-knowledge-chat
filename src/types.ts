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

declare module 'koishi' {
    interface Tables {
        chathub_knowledge: DocumentConfig
    }
}
